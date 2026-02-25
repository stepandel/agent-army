/**
 * clawup init — Interactive setup wizard
 *
 * Identity-driven: every agent must have an identity source.
 * The manifest stores only team composition (which agents to deploy).
 * Plugins, deps, and config come from identities at deploy time.
 *
 * This command collects infrastructure config + agents interactively,
 * then writes clawup.yaml + .env.example. Secrets and Pulumi provisioning
 * are handled by `clawup setup`.
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
  // Check for existing manifest
  // -------------------------------------------------------------------------
  const projectRoot = findProjectRoot();
  if (projectRoot) {
    const manifestPath = path.join(projectRoot, MANIFEST_FILE);
    p.log.warn(`${MANIFEST_FILE} already exists at ${manifestPath}`);
    if (!opts.yes) {
      const overwrite = await p.confirm({
        message: "Overwrite existing config?",
        initialValue: false,
      });
      handleCancel(overwrite);
      if (!overwrite) {
        p.cancel("Init cancelled. Run `clawup setup` to validate secrets and configure Pulumi.");
        process.exit(0);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Step 1: Check prerequisites
  // -------------------------------------------------------------------------
  p.log.step("Checking prerequisites...");
  const prereqsOk = await checkPrerequisites();
  if (!prereqsOk) {
    exitWithError("Prerequisites not met. Please install the missing tools and try again.");
  }
  p.log.success("All prerequisites satisfied!");

  // -------------------------------------------------------------------------
  // Step 2: Infrastructure config
  // -------------------------------------------------------------------------
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

  // -------------------------------------------------------------------------
  // Step 3: Owner info
  // -------------------------------------------------------------------------
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

  // -------------------------------------------------------------------------
  // Step 4: Agent selection (identity-driven, no custom mode)
  // -------------------------------------------------------------------------
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

  // Collect built-in agents
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

  // Collect identity-source agents
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

        // Allow volume size override
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

  // -------------------------------------------------------------------------
  // Step 5: Collect template variable values
  // -------------------------------------------------------------------------

  // Auto-fillable vars from owner info
  const autoVars: Record<string, string> = {
    OWNER_NAME: basicConfig.ownerName,
    TIMEZONE: basicConfig.timezone,
    WORKING_HOURS: basicConfig.workingHours,
    USER_NOTES: basicConfig.userNotes,
  };

  // Scan all identities for template vars and deduplicate
  const allTemplateVarNames = new Set<string>();
  for (const fi of fetchedIdentities) {
    for (const v of fi.manifest.templateVars ?? []) {
      allTemplateVarNames.add(v);
    }
  }

  const templateVars: Record<string, string> = {};

  // Auto-fill known vars
  for (const varName of allTemplateVarNames) {
    if (autoVars[varName]) {
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

  // -------------------------------------------------------------------------
  // Build plugin/dep maps (needed for manifest secrets and plugin defaults)
  // -------------------------------------------------------------------------
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

  // Track identity pluginDefaults per agent name for seeding plugin config
  const identityPluginDefaults: Record<string, Record<string, Record<string, unknown>>> = {};
  for (const fi of fetchedIdentities) {
    if (fi.manifest.pluginDefaults) {
      identityPluginDefaults[fi.agent.name] = fi.manifest.pluginDefaults;
    }
  }

  // -------------------------------------------------------------------------
  // Step 6: Summary
  // -------------------------------------------------------------------------
  const costEstimates = basicConfig.provider === "aws" ? COST_ESTIMATES : HETZNER_COST_ESTIMATES;
  const costPerAgent = costEstimates[basicConfig.instanceType] ?? 30;
  const totalCost = agents.reduce((sum, a) => {
    const agentCost = costEstimates[a.instanceType ?? basicConfig.instanceType] ?? costPerAgent;
    return sum + agentCost;
  }, 0);

  const integrationNames: string[] = [];
  if (allPluginNames.has("openclaw-linear")) integrationNames.push("Linear");
  if (allPluginNames.has("slack")) integrationNames.push("Slack");
  if (allDepNames.has("gh")) integrationNames.push("GitHub CLI");
  if (allDepNames.has("brave-search")) integrationNames.push("Brave Search");

  const providerLabel = basicConfig.provider === "aws" ? "AWS" : "Hetzner";
  const regionLabel = basicConfig.provider === "aws" ? "Region" : "Location";

  // Build template vars display (excluding auto-filled owner vars)
  const customVarEntries = Object.entries(templateVars).filter(
    ([k]) => !autoVars[k]
  );

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

  // -------------------------------------------------------------------------
  // Step 7: Confirm
  // -------------------------------------------------------------------------
  const confirmed = await p.confirm({
    message: "Proceed?",
  });
  handleCancel(confirmed);
  if (!confirmed) {
    p.cancel("Setup cancelled.");
    process.exit(0);
  }

  // -------------------------------------------------------------------------
  // Step 8: Write manifest + .env.example
  // -------------------------------------------------------------------------
  const s = p.spinner();
  s.start(`Writing ${MANIFEST_FILE}...`);

  // Only include non-auto template vars in manifest (owner vars are derived at deploy time)
  const manifestTemplateVars: Record<string, string> = {};
  for (const [k, v] of Object.entries(templateVars)) {
    if (!autoVars[k]) {
      manifestTemplateVars[k] = v;
    }
  }

  // Build secrets section for the manifest
  const manifestSecrets = buildManifestSecrets({
    provider: basicConfig.provider,
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

  // Apply per-agent secrets to agent definitions
  for (const agent of agents) {
    const perAgentSec = manifestSecrets.perAgent[agent.name];
    if (perAgentSec && Object.keys(perAgentSec).length > 0) {
      agent.secrets = perAgentSec;
    }
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
    secrets: manifestSecrets.global,
    agents,
  };

  // Inline plugin config into each agent definition (minus linearUserUuid — set by setup)
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

      inlinePlugins[pluginName] = agentConfig;
    }

    if (Object.keys(inlinePlugins).length > 0) {
      fi.agent.plugins = inlinePlugins;
    }
  }

  // Write manifest to CWD (project root)
  const manifestPath = path.join(process.cwd(), MANIFEST_FILE);
  fs.writeFileSync(manifestPath, YAML.stringify(manifest), "utf-8");

  // Generate .env.example alongside the manifest
  const envExampleContent = generateEnvExample({
    globalSecrets: manifestSecrets.global,
    agents: agents.map((a) => ({ name: a.name, displayName: a.displayName, role: a.role })),
    perAgentSecrets: manifestSecrets.perAgent,
  });
  fs.writeFileSync(path.join(process.cwd(), ".env.example"), envExampleContent, "utf-8");

  // Ensure .clawup/ and .env are in .gitignore
  const gitignorePath = path.join(process.cwd(), ".gitignore");
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

  p.note(
    [
      "1. Copy .env.example to .env and fill in your secrets",
      "2. Run `clawup setup` to validate and configure Pulumi",
    ].join("\n"),
    "Next steps"
  );
  p.outro("Done!");
}
