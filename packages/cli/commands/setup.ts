/**
 * clawup setup — Non-interactive secret validation + Pulumi provisioning
 *
 * Reads clawup.yaml + .env, validates all secrets are present,
 * fetches identities, does Linear UUID lookup, sets Pulumi config.
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as p from "@clack/prompts";
import YAML from "yaml";
import type { AgentDefinition, ClawupManifest, IdentityManifest } from "@clawup/core";
import {
  MANIFEST_FILE,
  ClawupManifestSchema,
  tailscaleHostname,
} from "@clawup/core";
import { fetchIdentity } from "@clawup/core/identity";
import { findProjectRoot } from "../lib/project";
import { selectOrCreateStack, setConfig, qualifiedStackName } from "../lib/pulumi";
import { ensureWorkspace, getWorkspaceDir } from "../lib/workspace";
import { showBanner, exitWithError } from "../lib/ui";
import {
  buildEnvDict,
  buildManifestSecrets,
  camelToScreamingSnake,
  generateEnvExample,
  loadEnvSecrets,
  VALIDATORS,
  agentEnvVarName,
} from "../lib/env";

interface SetupOptions {
  envFile?: string;
  deploy?: boolean;
  yes?: boolean;
}

/** Fetched identity data stored alongside the agent definition */
interface FetchedIdentity {
  agent: AgentDefinition;
  manifest: IdentityManifest;
}

export async function setupCommand(opts: SetupOptions = {}): Promise<void> {
  showBanner();

  // -------------------------------------------------------------------------
  // 1. Load manifest
  // -------------------------------------------------------------------------
  const projectRoot = findProjectRoot();
  if (!projectRoot) {
    exitWithError(
      `${MANIFEST_FILE} not found. Run \`clawup init\` first to create your project manifest.`
    );
  }

  const manifestPath = path.join(projectRoot, MANIFEST_FILE);
  let validation: ReturnType<typeof ClawupManifestSchema.safeParse>;
  try {
    const raw = fs.readFileSync(manifestPath, "utf-8");
    const parsed = YAML.parse(raw);
    validation = ClawupManifestSchema.safeParse(parsed);
  } catch (err) {
    exitWithError(
      `Failed to read/parse ${MANIFEST_FILE} at ${manifestPath}: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    return;
  }
  if (!validation.success) {
    const issues = validation.error.issues.map((i) => i.message).join(", ");
    exitWithError(`Invalid ${MANIFEST_FILE} at ${manifestPath}: ${issues}`);
    return;
  }
  const manifest = validation.data;
  const agents = manifest.agents;

  p.log.info(`Project: ${manifestPath}`);
  p.log.info(
    `Stack: ${manifest.stackName} | Provider: ${manifest.provider} | ${agents.length} agent(s)`
  );

  // -------------------------------------------------------------------------
  // 2. Fetch identities
  // -------------------------------------------------------------------------
  const identityCacheDir = path.join(os.homedir(), ".clawup", "identity-cache");
  const fetchedIdentities: FetchedIdentity[] = [];

  const identitySpinner = p.spinner();
  identitySpinner.start("Resolving agent identities...");
  for (const agent of agents) {
    try {
      const identity = await fetchIdentity(agent.identity, identityCacheDir);
      fetchedIdentities.push({ agent, manifest: identity.manifest });
    } catch (err) {
      identitySpinner.stop(`Failed to resolve identity for ${agent.name}`);
      exitWithError(
        `Failed to resolve identity "${agent.identity}": ${
          err instanceof Error ? err.message : String(err)
        }`
      );
      return;
    }
  }
  identitySpinner.stop(
    `Resolved ${fetchedIdentities.length} agent identit${fetchedIdentities.length === 1 ? "y" : "ies"}`
  );

  // Build plugin/dep maps
  const agentPlugins = new Map<string, Set<string>>();
  const agentDeps = new Map<string, Set<string>>();
  const allPluginNames = new Set<string>();
  const allDepNames = new Set<string>();

  for (const fi of fetchedIdentities) {
    const plugins = new Set(fi.manifest.plugins ?? []);
    const deps = new Set(fi.manifest.deps ?? []);
    agentPlugins.set(fi.agent.name, plugins);
    agentDeps.set(fi.agent.name, deps);
    for (const pl of plugins) allPluginNames.add(pl);
    for (const d of deps) allDepNames.add(d);
  }

  const identityPluginDefaults: Record<string, Record<string, Record<string, unknown>>> = {};
  for (const fi of fetchedIdentities) {
    if (fi.manifest.pluginDefaults) {
      identityPluginDefaults[fi.agent.name] = fi.manifest.pluginDefaults;
    }
  }

  // Collect requiredSecrets from identities
  const agentRequiredSecrets: Record<string, string[]> = {};
  for (const fi of fetchedIdentities) {
    if (fi.manifest.requiredSecrets && fi.manifest.requiredSecrets.length > 0) {
      agentRequiredSecrets[fi.agent.name] = fi.manifest.requiredSecrets;
    }
  }

  // -------------------------------------------------------------------------
  // 3. Resolve template vars
  // -------------------------------------------------------------------------
  const allTemplateVarNames = new Set<string>();
  for (const fi of fetchedIdentities) {
    for (const v of fi.manifest.templateVars ?? []) {
      allTemplateVarNames.add(v);
    }
  }

  // Auto-fillable vars from manifest owner info
  const autoVars: Record<string, string> = {};
  if (manifest.ownerName) autoVars.OWNER_NAME = manifest.ownerName;
  if (manifest.timezone) autoVars.TIMEZONE = manifest.timezone;
  if (manifest.workingHours) autoVars.WORKING_HOURS = manifest.workingHours;
  if (manifest.userNotes) autoVars.USER_NOTES = manifest.userNotes;

  const templateVars: Record<string, string> = { ...(manifest.templateVars ?? {}) };
  for (const varName of allTemplateVarNames) {
    if (!templateVars[varName] && autoVars[varName]) {
      templateVars[varName] = autoVars[varName];
    }
  }

  const missingTemplateVars = [...allTemplateVarNames].filter((v) => !templateVars[v]);
  if (missingTemplateVars.length > 0) {
    p.log.error("Missing template variables in clawup.yaml:");
    for (const v of missingTemplateVars) {
      p.log.error(`  ${v}`);
    }
    exitWithError(
      "Add the missing template variables to the templateVars section of clawup.yaml, then run `clawup setup` again."
    );
  }

  // -------------------------------------------------------------------------
  // 4. Load .env
  // -------------------------------------------------------------------------
  const envFilePath = opts.envFile ?? path.join(projectRoot, ".env");
  if (!fs.existsSync(envFilePath)) {
    exitWithError(
      `No .env found at ${envFilePath}.\nCopy .env.example to .env and fill in your secrets, then run \`clawup setup\` again.`
    );
  }
  const envDict = buildEnvDict(envFilePath);

  // -------------------------------------------------------------------------
  // 5. Resolve secrets — rebuild manifest secrets from identity data
  // -------------------------------------------------------------------------
  // Rebuild the full secrets map from identity data to catch any new
  // requiredSecrets that may not be in the manifest yet
  const expectedSecrets = buildManifestSecrets({
    provider: manifest.provider,
    agents: agents.map((a) => {
      const fi = fetchedIdentities.find((f) => f.agent.name === a.name);
      return {
        name: a.name,
        role: a.role,
        displayName: a.displayName,
        requiredSecrets: fi?.manifest.requiredSecrets,
      };
    }),
    allPluginNames,
    allDepNames,
    agentPlugins,
    agentDeps,
  });

  // Merge expected secrets into manifest (add any missing env refs)
  const mergedGlobalSecrets = { ...(manifest.secrets ?? {}), ...expectedSecrets.global };
  for (const agent of agents) {
    const expected = expectedSecrets.perAgent[agent.name];
    if (expected) {
      agent.secrets = { ...(agent.secrets ?? {}), ...expected };
    }
  }

  const resolvedSecrets = loadEnvSecrets(mergedGlobalSecrets, agents, envDict);

  // -------------------------------------------------------------------------
  // 6. Validate completeness
  // -------------------------------------------------------------------------
  const missingSecrets = [...resolvedSecrets.missing];

  // Run validators on resolved values (warn, don't block)
  for (const [key, value] of Object.entries(resolvedSecrets.global)) {
    const validator = VALIDATORS[key];
    if (validator) {
      const warning = validator(value);
      if (warning) {
        p.log.warn(`${key}: ${warning}`);
      }
    }
  }
  for (const [agentName, agentSecrets] of Object.entries(resolvedSecrets.perAgent)) {
    for (const [key, value] of Object.entries(agentSecrets)) {
      const validator = VALIDATORS[key];
      if (validator) {
        const warning = validator(value);
        if (warning) {
          const agent = agents.find((a) => a.name === agentName);
          p.log.warn(`${key} (${agent?.displayName ?? agentName}): ${warning}`);
        }
      }
    }
  }

  if (missingSecrets.length > 0) {
    console.log();
    p.log.error("Missing secrets in .env:");
    for (const m of missingSecrets) {
      const hint = getValidatorHint(m.key);
      const agentLabel = m.agent
        ? ` — Agent: ${agents.find((a) => a.name === m.agent)?.displayName ?? m.agent}`
        : " — Required";
      p.log.error(`  ${m.envVar.padEnd(30)}${agentLabel}${hint ? ` (${hint})` : ""}`);
    }
    console.log();
    exitWithError("Fill these in your .env file, then run `clawup setup` again.");
  }

  p.log.success("All secrets resolved");

  // -------------------------------------------------------------------------
  // 7. Linear UUID fetch
  // -------------------------------------------------------------------------
  const integrationCredentials: Record<string, { linearUserUuid?: string }> = {};

  if (allPluginNames.has("openclaw-linear")) {
    const linearAgents = fetchedIdentities.filter(
      (fi) => agentPlugins.get(fi.agent.name)?.has("openclaw-linear")
    );

    for (const fi of linearAgents) {
      const roleUpper = fi.agent.role.toUpperCase();

      // Check if linearUserUuid is already in manifest plugin config
      const existingPluginConfig = fi.agent.plugins?.["openclaw-linear"] as Record<string, unknown> | undefined;
      if (existingPluginConfig?.linearUserUuid) {
        integrationCredentials[fi.agent.role] = {
          linearUserUuid: existingPluginConfig.linearUserUuid as string,
        };
        continue;
      }

      // Check if set as env var
      const envUuid = envDict[`${roleUpper}_LINEAR_USER_UUID`];
      if (envUuid) {
        p.log.success(`linearUserUuid for ${fi.agent.displayName} (from ${roleUpper}_LINEAR_USER_UUID)`);
        integrationCredentials[fi.agent.role] = { linearUserUuid: envUuid };
        continue;
      }

      // Fetch from Linear API
      const linearApiKey = resolvedSecrets.perAgent[fi.agent.name]?.linearApiKey;
      if (!linearApiKey) {
        exitWithError(
          `Cannot fetch Linear user UUID for ${fi.agent.displayName}: linearApiKey not resolved.`
        );
      }

      const s = p.spinner();
      s.start(`Fetching Linear user ID for ${fi.agent.displayName}...`);
      try {
        const res = await fetch("https://api.linear.app/graphql", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: linearApiKey,
          },
          body: JSON.stringify({ query: "{ viewer { id } }" }),
        });
        const data = (await res.json()) as { data?: { viewer?: { id?: string } } };
        const uuid = data?.data?.viewer?.id;
        if (!uuid) throw new Error("No user ID in response");
        integrationCredentials[fi.agent.role] = { linearUserUuid: uuid };
        s.stop(`${fi.agent.displayName}: ${uuid}`);
      } catch (err) {
        s.stop(`Could not fetch Linear user ID for ${fi.agent.displayName}`);
        exitWithError(
          `Failed to fetch Linear user UUID: ${err instanceof Error ? err.message : String(err)}\n` +
          `Set ${roleUpper}_LINEAR_USER_UUID in your .env file to bypass the API call, then run \`clawup setup\` again.`
        );
      }
    }
  }

  // -------------------------------------------------------------------------
  // 8. Update manifest
  // -------------------------------------------------------------------------
  const s = p.spinner();
  s.start("Updating manifest...");

  // Update manifest secrets section
  manifest.secrets = mergedGlobalSecrets;

  // Inline plugin config into each agent definition
  for (const fi of fetchedIdentities) {
    const rolePlugins = agentPlugins.get(fi.agent.name);
    if (!rolePlugins || rolePlugins.size === 0) continue;

    const inlinePlugins: Record<string, Record<string, unknown>> = {};
    const defaults = identityPluginDefaults[fi.agent.name] ?? {};

    for (const pluginName of rolePlugins) {
      const pluginDefaults = defaults[pluginName] ?? {};
      const agentConfig: Record<string, unknown> = {
        ...pluginDefaults,
        agentId: fi.agent.name,
      };

      if (pluginName === "openclaw-linear") {
        const creds = integrationCredentials[fi.agent.role];
        if (creds?.linearUserUuid) {
          agentConfig.linearUserUuid = creds.linearUserUuid;
        }
      }

      inlinePlugins[pluginName] = agentConfig;
    }

    if (Object.keys(inlinePlugins).length > 0) {
      fi.agent.plugins = inlinePlugins;
    }
  }

  // Add requiredSecrets-derived env refs to per-agent secrets in manifest
  for (const fi of fetchedIdentities) {
    if (!fi.manifest.requiredSecrets || fi.manifest.requiredSecrets.length === 0) continue;

    const plugins = agentPlugins.get(fi.agent.name);
    const deps = agentDeps.get(fi.agent.name);
    const roleUpper = fi.agent.role.toUpperCase();

    if (!fi.agent.secrets) fi.agent.secrets = {};

    for (const key of fi.manifest.requiredSecrets) {
      if (fi.agent.secrets[key]) continue;
      const alreadyCovered =
        (key === "slackBotToken" && plugins?.has("slack")) ||
        (key === "slackAppToken" && plugins?.has("slack")) ||
        (key === "linearApiKey" && plugins?.has("openclaw-linear")) ||
        (key === "linearWebhookSecret" && plugins?.has("openclaw-linear")) ||
        (key === "githubToken" && deps?.has("gh"));
      if (alreadyCovered) continue;
      fi.agent.secrets[key] = `\${env:${roleUpper}_${camelToScreamingSnake(key)}}`;
    }
  }

  // Write updated manifest
  fs.writeFileSync(manifestPath, YAML.stringify(manifest), "utf-8");

  // Regenerate .env.example
  const perAgentSecrets: Record<string, Record<string, string>> = {};
  for (const agent of agents) {
    if (agent.secrets) perAgentSecrets[agent.name] = agent.secrets;
  }
  const envExampleContent = generateEnvExample({
    globalSecrets: manifest.secrets,
    agents: agents.map((a) => ({ name: a.name, displayName: a.displayName, role: a.role })),
    perAgentSecrets,
  });
  fs.writeFileSync(path.join(projectRoot, ".env.example"), envExampleContent, "utf-8");
  s.stop("Manifest updated");

  // -------------------------------------------------------------------------
  // 9. Provision Pulumi
  // -------------------------------------------------------------------------
  s.start("Setting up workspace...");
  const wsResult = ensureWorkspace();
  if (!wsResult.ok) {
    s.stop("Failed to set up workspace");
    exitWithError(wsResult.error ?? "Failed to set up workspace.");
  }
  s.stop("Workspace ready");
  const cwd = getWorkspaceDir();

  // Ensure .clawup/ and .env are in .gitignore
  const gitignorePath = path.join(projectRoot, ".gitignore");
  const ignoreEntries = [".clawup/", ".env"];
  if (fs.existsSync(gitignorePath)) {
    const existing = fs.readFileSync(gitignorePath, "utf-8");
    const toAdd = ignoreEntries.filter((entry) => !existing.includes(entry));
    if (toAdd.length > 0) {
      fs.appendFileSync(gitignorePath, `\n# clawup local state\n${toAdd.join("\n")}\n`);
    }
  } else {
    fs.writeFileSync(gitignorePath, `# clawup local state\n${ignoreEntries.join("\n")}\n`, "utf-8");
  }

  // Select/create stack
  const pulumiStack = qualifiedStackName(manifest.stackName, manifest.organization);
  s.start("Selecting Pulumi stack...");
  const stackResult = selectOrCreateStack(pulumiStack, cwd, projectRoot);
  if (!stackResult.ok) {
    s.stop("Failed to select/create stack");
    if (stackResult.error) p.log.error(stackResult.error);
    exitWithError(`Could not select or create Pulumi stack "${pulumiStack}".`);
  }
  s.stop("Pulumi stack ready");

  // Set Pulumi config
  s.start("Setting Pulumi configuration...");
  setConfig("provider", manifest.provider, false, cwd);
  if (manifest.provider === "aws") {
    setConfig("aws:region", manifest.region, false, cwd);
  } else {
    setConfig("hetzner:location", manifest.region, false, cwd);
    if (resolvedSecrets.global.hcloudToken) {
      setConfig("hcloud:token", resolvedSecrets.global.hcloudToken, true, cwd);
    }
  }
  setConfig("anthropicApiKey", resolvedSecrets.global.anthropicApiKey, true, cwd);
  setConfig("tailscaleAuthKey", resolvedSecrets.global.tailscaleAuthKey, true, cwd);
  setConfig("tailnetDnsName", resolvedSecrets.global.tailnetDnsName, false, cwd);
  if (resolvedSecrets.global.tailscaleApiKey) {
    setConfig("tailscaleApiKey", resolvedSecrets.global.tailscaleApiKey, true, cwd);
  }
  setConfig("instanceType", manifest.instanceType, false, cwd);
  setConfig("ownerName", manifest.ownerName, false, cwd);
  if (manifest.timezone) setConfig("timezone", manifest.timezone, false, cwd);
  if (manifest.workingHours) setConfig("workingHours", manifest.workingHours, false, cwd);
  if (manifest.userNotes) setConfig("userNotes", manifest.userNotes, false, cwd);

  // Set per-agent secrets
  for (const [agentName, agentSecrets] of Object.entries(resolvedSecrets.perAgent)) {
    const agent = agents.find((a) => a.name === agentName);
    if (!agent) continue;
    const role = agent.role;

    for (const [key, value] of Object.entries(agentSecrets)) {
      const configKey = `${role}${key.charAt(0).toUpperCase()}${key.slice(1)}`;
      const isSecret = key !== "linearUserUuid";
      setConfig(configKey, value, isSecret, cwd);
    }
  }

  // Set Linear user UUIDs
  for (const [role, creds] of Object.entries(integrationCredentials)) {
    if (creds.linearUserUuid) {
      setConfig(`${role}LinearUserUuid`, creds.linearUserUuid, false, cwd);
    }
  }

  if (resolvedSecrets.global.braveApiKey) {
    setConfig("braveApiKey", resolvedSecrets.global.braveApiKey, true, cwd);
  }
  s.stop("Configuration saved");

  // -------------------------------------------------------------------------
  // 10. Optional deploy
  // -------------------------------------------------------------------------
  if (opts.deploy) {
    p.log.success("Setup complete! Starting deployment...\n");
    const { deployCommand } = await import("./deploy.js");
    await deployCommand({ yes: opts.yes });
  } else {
    p.outro("Setup complete! Run `clawup deploy` to deploy your agents.");
  }
}

/** Get a human-readable hint for a validator */
function getValidatorHint(key: string): string {
  const hints: Record<string, string> = {
    anthropicApiKey: "must start with sk-ant-",
    tailscaleAuthKey: "must start with tskey-auth-",
    tailnetDnsName: "must end with .ts.net",
    slackBotToken: "must start with xoxb-",
    slackAppToken: "must start with xapp-",
    linearApiKey: "must start with lin_api_",
    githubToken: "must start with ghp_ or github_pat_",
  };
  return hints[key] ?? "";
}
