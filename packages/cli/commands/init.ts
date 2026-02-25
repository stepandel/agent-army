/**
 * clawup init — Interactive setup wizard
 *
 * Identity-driven: every agent must have an identity source.
 * The manifest stores only team composition (which agents to deploy).
 * Plugins, deps, and config come from identities at deploy time.
 *
 * Two modes:
 * - Fresh init (no clawup.yaml): full interactive wizard
 * - Repair mode (clawup.yaml exists): re-fetch identities, update secrets/plugins,
 *   prompt only for new template vars, rewrite manifest + .env.example
 */

import * as fs from "fs";
import * as p from "@clack/prompts";
import YAML from "yaml";
import type { AgentDefinition, ClawupManifest, IdentityManifest } from "@clawup/core";
import {
  BUILT_IN_IDENTITIES,
  PROVIDERS,
  AWS_REGIONS,
  HETZNER_LOCATIONS,
  INSTANCE_TYPES,
  hetznerServerTypes,
  COST_ESTIMATES,
  HETZNER_COST_ESTIMATES,
  MANIFEST_FILE,
  ClawupManifestSchema,
} from "@clawup/core";
import { fetchIdentity } from "@clawup/core/identity";
import * as os from "os";
import * as path from "path";
import { checkPrerequisites } from "../lib/prerequisites";
import { showBanner, handleCancel, exitWithError, formatCost, formatAgentList } from "../lib/ui";
import { findProjectRoot } from "../lib/project";
import {
  buildManifestSecrets,
  generateEnvExample,
} from "../lib/env";

interface InitOptions {
  yes?: boolean;
}

/** Fetched identity data stored alongside the agent definition */
interface FetchedIdentity {
  agent: AgentDefinition;
  manifest: IdentityManifest;
}

export async function initCommand(opts: InitOptions = {}): Promise<void> {
  showBanner();

  // -------------------------------------------------------------------------
  // Check for existing manifest — enter repair mode if found
  // -------------------------------------------------------------------------
  const projectRoot = findProjectRoot();
  if (projectRoot) {
    return repairMode(projectRoot);
  }

  // -------------------------------------------------------------------------
  // Fresh init: full interactive wizard
  // -------------------------------------------------------------------------

  // Step 1: Check prerequisites
  p.log.step("Checking prerequisites...");
  const prereqsOk = await checkPrerequisites();
  if (!prereqsOk) {
    exitWithError("Prerequisites not met. Please install the missing tools and try again.");
  }
  p.log.success("All prerequisites satisfied!");

  // Step 2: Infrastructure config
  const stackName = await p.text({
    message: "Pulumi stack name",
    placeholder: "dev",
    defaultValue: "dev",
  });
  handleCancel(stackName);

  const organization = await p.text({
    message: "Pulumi organization (leave empty for personal account)",
    placeholder: "my-org",
    defaultValue: "",
  });
  handleCancel(organization);

  const provider = await p.select({
    message: "Cloud provider",
    options: PROVIDERS.map((prov) => ({ value: prov.value, label: prov.label, hint: prov.hint })),
    initialValue: "aws",
  });
  handleCancel(provider);

  let region: string;
  let instanceType: string;

  if (provider === "aws") {
    const awsRegion = await p.select({
      message: "AWS region",
      options: AWS_REGIONS,
      initialValue: "us-east-1",
    });
    handleCancel(awsRegion);
    region = awsRegion as string;

    const awsInstanceType = await p.select({
      message: "Default instance type",
      options: INSTANCE_TYPES,
      initialValue: "t3.medium",
    });
    handleCancel(awsInstanceType);
    instanceType = awsInstanceType as string;
  } else {
    const hetznerLocation = await p.select({
      message: "Hetzner location",
      options: HETZNER_LOCATIONS,
      initialValue: "fsn1",
    });
    handleCancel(hetznerLocation);
    region = hetznerLocation as string;

    const serverTypeOptions = hetznerServerTypes(region);
    const hetznerServerType = await p.select({
      message: "Default server type",
      options: serverTypeOptions,
      initialValue: serverTypeOptions[0].value,
    });
    handleCancel(hetznerServerType);
    instanceType = hetznerServerType as string;
  }

  // Step 3: Owner info
  const ownerName = await p.text({
    message: "Owner name (for workspace templates)",
    placeholder: "Boss",
    defaultValue: "Boss",
  });
  handleCancel(ownerName);

  const timezone = await p.text({
    message: "Your timezone",
    placeholder: "PST (America/Los_Angeles)",
    defaultValue: "PST (America/Los_Angeles)",
  });
  handleCancel(timezone);

  const workingHours = await p.text({
    message: "Your working hours",
    placeholder: "9am-6pm",
    defaultValue: "9am-6pm",
  });
  handleCancel(workingHours);

  const userNotes = await p.text({
    message: "Any notes for your agents about you? (optional)",
    placeholder: "e.g., Prefers concise updates, hates unnecessary meetings",
    defaultValue: "",
  });
  handleCancel(userNotes);

  const orgValue = (organization as string).trim() || undefined;

  const basicConfig = {
    stackName: stackName as string,
    organization: orgValue,
    provider: provider as "aws" | "hetzner",
    region,
    instanceType,
    ownerName: ownerName as string,
    timezone: timezone as string,
    workingHours: workingHours as string,
    userNotes: (userNotes as string) || "No additional notes provided yet.",
  };

  // Step 4: Agent selection
  p.log.step("Configure agents");

  const agentMode = await p.select({
    message: "How would you like to configure agents?",
    options: [
      { value: "built-in", label: "Built-in agents", hint: "PM (Juno), Eng (Titus), QA (Scout)" },
      { value: "identity", label: "From identity source", hint: "Load from a Git URL or local path" },
      { value: "mix", label: "Mix of both", hint: "Pick built-in + add from identity source" },
    ],
  });
  handleCancel(agentMode);

  const fetchedIdentities: FetchedIdentity[] = [];
  const identityCacheDir = path.join(os.homedir(), ".clawup", "identity-cache");

  if (agentMode === "built-in" || agentMode === "mix") {
    const selectedBuiltIns = await p.multiselect({
      message: "Select agents",
      options: Object.entries(BUILT_IN_IDENTITIES).map(([key, entry]) => ({
        value: key,
        label: entry.label,
        hint: entry.hint,
      })),
      required: agentMode === "built-in",
    });
    handleCancel(selectedBuiltIns);

    for (const key of selectedBuiltIns as string[]) {
      const entry = BUILT_IN_IDENTITIES[key];
      const identity = await fetchIdentity(entry.path, identityCacheDir);
      const agent: AgentDefinition = {
        name: `agent-${identity.manifest.name}`,
        displayName: identity.manifest.displayName,
        role: identity.manifest.role,
        identity: entry.path,
        volumeSize: identity.manifest.volumeSize,
      };
      fetchedIdentities.push({ agent, manifest: identity.manifest });
    }
  }

  if (agentMode === "identity" || agentMode === "mix") {
    let addMore = true;

    while (addMore) {
      const identityUrl = await p.text({
        message: "Identity source (Git URL or local path)",
        placeholder: "https://github.com/org/identities#agent-name",
        validate: (val) => {
          if (!val.trim()) return "Identity source is required";
        },
      });
      handleCancel(identityUrl);

      const spinner = p.spinner();
      spinner.start("Validating identity...");

      try {
        const identity = await fetchIdentity(identityUrl as string, identityCacheDir);
        spinner.stop(
          `Found: ${identity.manifest.displayName} (${identity.manifest.role}) — ${identity.manifest.description}`
        );

        const volumeOverride = await p.text({
          message: `Volume size in GB (default: ${identity.manifest.volumeSize})`,
          placeholder: String(identity.manifest.volumeSize),
          defaultValue: String(identity.manifest.volumeSize),
          validate: (val) => {
            const n = parseInt(val, 10);
            if (isNaN(n) || n < 8 || n > 500) return "Must be between 8 and 500";
          },
        });
        handleCancel(volumeOverride);

        const agent: AgentDefinition = {
          name: `agent-${identity.manifest.name}`,
          displayName: identity.manifest.displayName,
          role: identity.manifest.role,
          identity: identityUrl as string,
          volumeSize: parseInt(volumeOverride as string, 10),
        };
        fetchedIdentities.push({ agent, manifest: identity.manifest });
      } catch (err) {
        spinner.stop(`Failed to validate identity: ${(err as Error).message}`);
        p.log.error("Please check the URL and try again.");
        continue;
      }

      const more = await p.confirm({
        message: "Add another identity-based agent?",
        initialValue: false,
      });
      handleCancel(more);
      addMore = more as boolean;
    }
  }

  if (fetchedIdentities.length === 0) {
    exitWithError("No agents configured. At least one agent is required.");
  }

  const agents = fetchedIdentities.map((fi) => fi.agent);

  // Step 5: Collect template variable values
  const autoVars: Record<string, string> = {
    OWNER_NAME: basicConfig.ownerName,
    TIMEZONE: basicConfig.timezone,
    WORKING_HOURS: basicConfig.workingHours,
    USER_NOTES: basicConfig.userNotes,
  };

  const templateVars = await collectTemplateVars(fetchedIdentities, autoVars);

  // Build plugin/dep maps
  const { agentPlugins, agentDeps, allPluginNames, allDepNames, identityPluginDefaults } =
    buildPluginDepMaps(fetchedIdentities);

  // Step 6: Summary
  const costEstimates = basicConfig.provider === "aws" ? COST_ESTIMATES : HETZNER_COST_ESTIMATES;
  const costPerAgent = costEstimates[basicConfig.instanceType] ?? 30;
  const totalCost = agents.reduce((sum, a) => {
    const agentCost = costEstimates[a.instanceType ?? basicConfig.instanceType] ?? costPerAgent;
    return sum + agentCost;
  }, 0);

  const integrationNames = buildIntegrationNames(allPluginNames, allDepNames);

  const providerLabel = basicConfig.provider === "aws" ? "AWS" : "Hetzner";
  const regionLabel = basicConfig.provider === "aws" ? "Region" : "Location";

  const customVarEntries = Object.entries(templateVars).filter(([k]) => !autoVars[k]);

  const summaryLines = [
    `Stack:          ${basicConfig.stackName}`,
    `Provider:       ${providerLabel}`,
    `${regionLabel.padEnd(14, " ")} ${basicConfig.region}`,
    `Instance type:  ${basicConfig.instanceType}`,
    `Owner:          ${basicConfig.ownerName}`,
    `Timezone:       ${basicConfig.timezone}`,
    `Working hours:  ${basicConfig.workingHours}`,
  ];
  if (customVarEntries.length > 0) {
    for (const [k, v] of customVarEntries) {
      summaryLines.push(`${k.padEnd(14, " ")} ${v}`);
    }
  }
  if (integrationNames.length > 0) {
    summaryLines.push(`Integrations:   ${integrationNames.join(", ")}`);
  }
  summaryLines.push(
    ``,
    `Agents (${agents.length}):`,
    formatAgentList(agents),
    ``,
    `Estimated cost: ${formatCost(totalCost)}`
  );

  p.note(summaryLines.join("\n"), "Deployment Summary");

  // Step 7: Confirm
  const confirmed = await p.confirm({ message: "Proceed?" });
  handleCancel(confirmed);
  if (!confirmed) {
    p.cancel("Setup cancelled.");
    process.exit(0);
  }

  // Step 8: Write manifest + .env.example
  const manifestTemplateVars: Record<string, string> = {};
  for (const [k, v] of Object.entries(templateVars)) {
    if (!autoVars[k]) manifestTemplateVars[k] = v;
  }

  const manifest: ClawupManifest = {
    stackName: basicConfig.stackName,
    organization: basicConfig.organization,
    provider: basicConfig.provider,
    region: basicConfig.region,
    instanceType: basicConfig.instanceType,
    ownerName: basicConfig.ownerName,
    timezone: basicConfig.timezone,
    workingHours: basicConfig.workingHours,
    userNotes: basicConfig.userNotes,
    templateVars: Object.keys(manifestTemplateVars).length > 0 ? manifestTemplateVars : undefined,
    agents,
  };

  writeManifest(manifest, fetchedIdentities, agentPlugins, agentDeps, allPluginNames, allDepNames, identityPluginDefaults, process.cwd());

  p.note(
    [
      "1. Copy .env.example to .env and fill in your secrets",
      "2. Run `clawup setup` to validate and configure Pulumi",
    ].join("\n"),
    "Next steps"
  );
  p.outro("Done!");
}

// ---------------------------------------------------------------------------
// Repair mode: clawup.yaml exists — refresh identities & update manifest
// ---------------------------------------------------------------------------

async function repairMode(projectRoot: string): Promise<void> {
  const manifestPath = path.join(projectRoot, MANIFEST_FILE);

  // Load and validate
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

  p.log.info(`Refreshing ${MANIFEST_FILE} at ${projectRoot}`);
  p.log.info(
    `Stack: ${manifest.stackName} | Provider: ${manifest.provider} | ${agents.length} agent(s)`
  );

  // Re-fetch identities
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

  // Auto-fillable vars from manifest owner info
  const autoVars: Record<string, string> = {};
  if (manifest.ownerName) autoVars.OWNER_NAME = manifest.ownerName;
  if (manifest.timezone) autoVars.TIMEZONE = manifest.timezone;
  if (manifest.workingHours) autoVars.WORKING_HOURS = manifest.workingHours;
  if (manifest.userNotes) autoVars.USER_NOTES = manifest.userNotes;

  // Collect template vars — use existing values, prompt only for new ones
  const existingTemplateVars = manifest.templateVars ?? {};
  const templateVars = await collectTemplateVars(fetchedIdentities, autoVars, existingTemplateVars);

  // Build plugin/dep maps
  const { agentPlugins, agentDeps, allPluginNames, allDepNames, identityPluginDefaults } =
    buildPluginDepMaps(fetchedIdentities);

  // Detect what changed
  const changes: string[] = [];

  // Check for new plugins/deps
  const integrationNames = buildIntegrationNames(allPluginNames, allDepNames);
  const newTemplateVars = Object.keys(templateVars).filter(
    (k) => !autoVars[k] && !existingTemplateVars[k]
  );
  if (newTemplateVars.length > 0) {
    changes.push(`New template variables: ${newTemplateVars.join(", ")}`);
  }

  // Update manifest templateVars (non-auto only)
  const manifestTemplateVars: Record<string, string> = {};
  for (const [k, v] of Object.entries(templateVars)) {
    if (!autoVars[k]) manifestTemplateVars[k] = v;
  }
  manifest.templateVars = Object.keys(manifestTemplateVars).length > 0 ? manifestTemplateVars : undefined;

  // Write updated manifest
  writeManifest(manifest, fetchedIdentities, agentPlugins, agentDeps, allPluginNames, allDepNames, identityPluginDefaults, projectRoot);

  if (changes.length > 0) {
    for (const c of changes) p.log.info(c);
  }

  p.log.success(`${MANIFEST_FILE} and .env.example updated`);
  p.outro("Run `clawup setup` to validate secrets and configure Pulumi.");
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Collect template variable values, prompting only for vars not in autoVars or existing */
async function collectTemplateVars(
  fetchedIdentities: FetchedIdentity[],
  autoVars: Record<string, string>,
  existing: Record<string, string> = {},
): Promise<Record<string, string>> {
  const allTemplateVarNames = new Set<string>();
  for (const fi of fetchedIdentities) {
    for (const v of fi.manifest.templateVars ?? []) {
      allTemplateVarNames.add(v);
    }
  }

  const templateVars: Record<string, string> = { ...existing };

  // Auto-fill known vars
  for (const varName of allTemplateVarNames) {
    if (!templateVars[varName] && autoVars[varName]) {
      templateVars[varName] = autoVars[varName];
    }
  }

  // Prompt for remaining vars
  const remainingVars = [...allTemplateVarNames].filter((v) => !templateVars[v]);
  if (remainingVars.length > 0) {
    p.log.step("Configure template variables");
    p.log.info(`Your agents use the following template variables: ${remainingVars.join(", ")}`);

    for (const varName of remainingVars) {
      const value = await p.text({
        message: `Value for ${varName}`,
        placeholder: varName === "LINEAR_TEAM" ? "e.g., ENG" : varName === "GITHUB_REPO" ? "https://github.com/org/repo" : "",
        validate: (val) => {
          if (!val.trim()) return `${varName} is required`;
        },
      });
      handleCancel(value);
      templateVars[varName] = value as string;
    }
  }

  return templateVars;
}

/** Build plugin/dep maps from fetched identities */
function buildPluginDepMaps(fetchedIdentities: FetchedIdentity[]) {
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

  return { agentPlugins, agentDeps, allPluginNames, allDepNames, identityPluginDefaults };
}

/** Build human-readable integration names from plugin/dep sets */
function buildIntegrationNames(allPluginNames: Set<string>, allDepNames: Set<string>): string[] {
  const names: string[] = [];
  if (allPluginNames.has("openclaw-linear")) names.push("Linear");
  if (allPluginNames.has("slack")) names.push("Slack");
  if (allDepNames.has("gh")) names.push("GitHub CLI");
  if (allDepNames.has("brave-search")) names.push("Brave Search");
  return names;
}

/** Write/update clawup.yaml + .env.example with current identity data */
function writeManifest(
  manifest: ClawupManifest,
  fetchedIdentities: FetchedIdentity[],
  agentPlugins: Map<string, Set<string>>,
  agentDeps: Map<string, Set<string>>,
  allPluginNames: Set<string>,
  allDepNames: Set<string>,
  identityPluginDefaults: Record<string, Record<string, Record<string, unknown>>>,
  outputDir: string,
): void {
  const s = p.spinner();
  s.start(`Writing ${MANIFEST_FILE}...`);

  const agents = manifest.agents;

  // Build secrets section
  const manifestSecrets = buildManifestSecrets({
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

  // Apply per-agent secrets
  for (const agent of agents) {
    const perAgentSec = manifestSecrets.perAgent[agent.name];
    if (perAgentSec && Object.keys(perAgentSec).length > 0) {
      agent.secrets = { ...(agent.secrets ?? {}), ...perAgentSec };
    }
  }
  manifest.secrets = { ...(manifest.secrets ?? {}), ...manifestSecrets.global };

  // Inline plugin config (minus linearUserUuid — set by setup)
  for (const fi of fetchedIdentities) {
    const rolePlugins = agentPlugins.get(fi.agent.name);
    if (!rolePlugins || rolePlugins.size === 0) continue;

    const inlinePlugins: Record<string, Record<string, unknown>> = {};
    const defaults = identityPluginDefaults[fi.agent.name] ?? {};
    // Preserve existing plugin config (e.g., linearUserUuid from a previous setup run)
    const existingPlugins = (fi.agent.plugins ?? {}) as Record<string, Record<string, unknown>>;

    for (const pluginName of rolePlugins) {
      const pluginDefaults = defaults[pluginName] ?? {};
      const existingConfig = existingPlugins[pluginName] ?? {};
      inlinePlugins[pluginName] = {
        ...pluginDefaults,
        ...existingConfig,
        agentId: fi.agent.name,
      };
    }

    if (Object.keys(inlinePlugins).length > 0) {
      fi.agent.plugins = inlinePlugins;
    }
  }

  // Write manifest
  const manifestPath = path.join(outputDir, MANIFEST_FILE);
  fs.writeFileSync(manifestPath, YAML.stringify(manifest), "utf-8");

  // Generate .env.example
  const perAgentSecrets: Record<string, Record<string, string>> = {};
  for (const agent of agents) {
    if (agent.secrets) perAgentSecrets[agent.name] = agent.secrets;
  }
  const envExampleContent = generateEnvExample({
    globalSecrets: manifest.secrets ?? {},
    agents: agents.map((a) => ({ name: a.name, displayName: a.displayName, role: a.role })),
    perAgentSecrets,
  });
  fs.writeFileSync(path.join(outputDir, ".env.example"), envExampleContent, "utf-8");

  // Ensure .clawup/ and .env are in .gitignore
  const gitignorePath = path.join(outputDir, ".gitignore");
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

  s.stop("Config saved");
}
