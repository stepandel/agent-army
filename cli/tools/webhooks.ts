/**
 * Webhooks Setup Tool — Configure Linear webhooks for deployed agents
 *
 * Platform-agnostic implementation using RuntimeAdapter.
 */

import type { RuntimeAdapter, ToolImplementation, ExecAdapter } from "../adapters";
import { loadManifest, resolveConfigName } from "../lib/config";
import { ensureWorkspace, getWorkspaceDir } from "../lib/workspace";
import pc from "picocolors";

export interface WebhooksSetupOptions {
  /** Config name (auto-detected if only one) */
  config?: string;
}

/**
 * Get stack outputs
 */
function getStackOutputs(exec: ExecAdapter, cwd?: string): Record<string, unknown> | null {
  const result = exec.capture("pulumi", ["stack", "output", "--json", "--show-secrets"], cwd);
  if (result.exitCode !== 0) return null;
  try {
    return JSON.parse(result.stdout);
  } catch {
    return null;
  }
}

/**
 * Webhooks setup tool implementation
 */
export const webhooksSetupTool: ToolImplementation<WebhooksSetupOptions> = async (
  runtime: RuntimeAdapter,
  options: WebhooksSetupOptions
) => {
  const { ui, exec } = runtime;

  ui.intro("Agent Army — Webhook Setup");

  // Ensure workspace is set up
  const wsResult = ensureWorkspace();
  if (!wsResult.ok) {
    ui.log.error(wsResult.error ?? "Failed to set up workspace.");
    process.exit(1);
  }
  const cwd = getWorkspaceDir();

  // Resolve config name and load manifest
  let configName: string;
  try {
    configName = resolveConfigName(options.config);
  } catch (err) {
    ui.log.error((err as Error).message);
    process.exit(1);
  }

  const manifest = loadManifest(configName);
  if (!manifest) {
    ui.log.error(`Config '${configName}' could not be loaded.`);
    process.exit(1);
  }

  // Select stack
  const selectResult = exec.capture("pulumi", ["stack", "select", manifest.stackName], cwd);
  if (selectResult.exitCode !== 0) {
    ui.log.error(`Could not select Pulumi stack "${manifest.stackName}". Run ${pc.cyan("agent-army deploy")} first.`);
    process.exit(1);
  }

  // Get stack outputs
  const outputs = getStackOutputs(exec, cwd);
  if (!outputs) {
    ui.log.error(`Could not fetch stack outputs. Run ${pc.cyan("agent-army deploy")} first.`);
    process.exit(1);
  }

  // Check if any webhook URLs exist
  const agentsWithUrls = manifest.agents.filter(
    (agent) => outputs[`${agent.role}WebhookUrl`]
  );

  if (agentsWithUrls.length === 0) {
    ui.log.error(
      "No webhook URLs found in stack outputs.\n" +
      `  Make sure agents are deployed and exposing webhook endpoints.\n` +
      `  Run ${pc.cyan("agent-army deploy")} if you haven't already.`
    );
    process.exit(1);
  }

  ui.note(
    [
      "This will walk you through creating Linear webhooks for each agent.",
      "You'll need access to your Linear workspace settings.",
    ].join("\n"),
    "Linear Webhook Setup"
  );

  // Collect webhook secrets for each agent
  const secrets: { role: string; secret: string }[] = [];

  for (const agent of manifest.agents) {
    const webhookUrl = outputs[`${agent.role}WebhookUrl`] as string | undefined;
    if (!webhookUrl) {
      ui.log.warn(`No webhook URL found for ${agent.displayName} (${agent.role}) — skipping.`);
      continue;
    }

    ui.note(
      [
        `Webhook URL: ${pc.cyan(String(webhookUrl))}`,
        "",
        "Steps:",
        "1. Go to Linear Settings → API → Webhooks → \"New webhook\"",
        "2. Paste the URL above",
        "3. Select events to receive (e.g., Issues, Comments)",
        "4. Create the webhook and copy the \"Signing secret\"",
      ].join("\n"),
      `${agent.displayName} (${agent.role})`
    );

    const secret = await ui.text({
      message: `Signing secret for ${agent.displayName}`,
      placeholder: "Paste the signing secret from Linear",
      validate: (val: string) => {
        if (!val) return "Signing secret is required";
      },
    });

    secrets.push({ role: agent.role, secret: secret as string });
  }

  if (secrets.length === 0) {
    ui.log.warn("No webhook secrets collected.");
    ui.outro("Nothing to do.");
    return;
  }

  // Store secrets in Pulumi config
  const spinner = ui.spinner("Saving webhook secrets to Pulumi config...");
  for (const { role, secret } of secrets) {
    exec.capture(
      "pulumi",
      ["config", "set", `${role}LinearWebhookSecret`, secret, "--secret"],
      cwd
    );
  }
  spinner.stop(`Saved ${secrets.length} webhook secret(s)`);

  // Ask to redeploy
  const redeploy = await ui.confirm({
    message: "Redeploy to apply webhook secrets?",
  });

  if (redeploy) {
    ui.log.step("Running pulumi up...");
    console.log();
    const exitCode = await exec.stream("pulumi", ["up", "--yes"], { cwd });
    console.log();

    if (exitCode !== 0) {
      ui.log.error("Deployment failed. Check the output above for details.");
      process.exit(1);
    }

    ui.outro("Webhook secrets applied! Your agents are now receiving Linear events.");
  } else {
    ui.outro(
      `Secrets saved. Run ${pc.cyan("agent-army deploy")} to apply them.`
    );
  }
};
