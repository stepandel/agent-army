/**
 * agent-army destroy — Tear down resources with safety confirmations
 */

import * as p from "@clack/prompts";
import { loadManifest } from "../lib/config";
import { pulumiDestroy, selectOrCreateStack, getConfig } from "../lib/pulumi";
import { capture } from "../lib/exec";
import { SSH_USER, tailscaleHostname } from "../lib/constants";
import { showBanner, handleCancel, exitWithError, formatAgentList } from "../lib/ui";
import { deleteTailscaleDevice, listTailscaleDevices } from "../lib/tailscale";

interface DestroyOptions {
  yes?: boolean;
}

/**
 * Deregister an agent from Tailscale by SSHing in and running `tailscale logout`.
 * Returns true if successful, false otherwise.
 *
 * Note: We use `nohup ... &` to background the command because `tailscale down`
 * immediately cuts the SSH connection (since SSH is via Tailscale), which would
 * cause the session to hang before `logout` can execute.
 */
function deregisterTailscale(host: string): boolean {
  const result = capture("ssh", [
    "-o", "ConnectTimeout=10",
    "-o", "StrictHostKeyChecking=no",
    "-o", "UserKnownHostsFile=/dev/null",
    "-o", "BatchMode=yes",
    `${SSH_USER}@${host}`,
    "nohup sh -c 'sleep 1 && sudo tailscale down && sudo tailscale logout' >/dev/null 2>&1 &",
  ]);
  return result.exitCode === 0;
}

export async function destroyCommand(opts: DestroyOptions): Promise<void> {
  showBanner();

  // Load manifest
  const manifest = loadManifest();
  if (!manifest) {
    exitWithError("No agent-army.json found. Run `agent-army init` first.");
  }

  // Select stack
  const stackResult = selectOrCreateStack(manifest.stackName);
  if (!stackResult.ok) {
    exitWithError(`Could not select Pulumi stack "${manifest.stackName}".`);
  }

  // Show what will be destroyed
  p.note(
    [
      `Stack:  ${manifest.stackName}`,
      `Region: ${manifest.region}`,
      ``,
      `Agents (${manifest.agents.length}):`,
      formatAgentList(manifest.agents),
      ``,
      `This will PERMANENTLY DESTROY:`,
      `  - ${manifest.agents.length} EC2 instances`,
      `  - All workspace data on those instances`,
      `  - VPC, subnet, and security group`,
      `  - Tailscale device registrations`,
    ].join("\n"),
    "Destruction Plan"
  );

  // Confirm
  if (!opts.yes) {
    const typedName = await p.text({
      message: `Type the stack name to confirm: "${manifest.stackName}"`,
      validate: (val) => {
        if (val !== manifest.stackName) return `Must type "${manifest.stackName}" to confirm`;
      },
    });
    handleCancel(typedName);

    const confirmed = await p.confirm({
      message: "Are you ABSOLUTELY sure?",
      initialValue: false,
    });
    handleCancel(confirmed);
    if (!confirmed) {
      p.cancel("Destruction cancelled.");
      process.exit(0);
    }
  }

  // Deregister agents from Tailscale before destroying infrastructure
  const tailnetDnsName = getConfig("tailnetDnsName");
  const tailscaleApiKey = getConfig("tailscaleApiKey");

  if (tailnetDnsName) {
    // Use Tailscale API for cleanup (primary method - most reliable)
    if (tailscaleApiKey) {
      const s = p.spinner();
      s.start("Removing agents from Tailscale via API...");
      const apiFailed: string[] = [];

      // Use the full tailnet DNS name for API calls (API expects "tailnet.ts.net")
      const tailnet = tailnetDnsName;
      const devices = listTailscaleDevices(tailscaleApiKey, tailnet);

      if (devices) {
        for (const agent of manifest.agents) {
          const tsHost = tailscaleHostname(manifest.stackName, agent.name);
          const device = devices.find((d) =>
            d.hostname === tsHost || d.name.startsWith(`${tsHost}.`)
          );
          if (device) {
            const deleted = deleteTailscaleDevice(tailscaleApiKey, device.id);
            if (!deleted) apiFailed.push(agent.name);
          } else {
            // Device not found — may already be gone, which is fine
          }
        }

        if (apiFailed.length === 0) {
          s.stop("All agents removed from Tailscale");
        } else {
          s.stop("Some devices could not be removed");
          p.log.warn(
            `Could not remove: ${apiFailed.join(", ")}. Remove manually from https://login.tailscale.com/admin/machines`
          );
        }
      } else {
        s.stop("Failed to list Tailscale devices");
        p.log.warn("Could not list Tailscale devices. Remove manually if needed.");
      }
    } else {
      // No API key - try SSH method (less reliable)
      const s = p.spinner();
      s.start("Deregistering agents from Tailscale via SSH...");
      const sshFailed: string[] = [];

      for (const agent of manifest.agents) {
        const tsHost = tailscaleHostname(manifest.stackName, agent.name);
        const host = `${tsHost}.${tailnetDnsName}`;
        const ok = deregisterTailscale(host);
        if (!ok) sshFailed.push(agent.name);
      }

      if (sshFailed.length === 0) {
        s.stop("All agents deregistered from Tailscale");
      } else {
        s.stop("Some agents could not be deregistered via SSH");
        p.log.warn(
          `Could not deregister: ${sshFailed.join(", ")}. Remove manually from https://login.tailscale.com/admin/machines`
        );
        p.log.message(
          "  Tip: Set a Tailscale API key (`agent-army init`) for more reliable cleanup."
        );
      }
    }
  }

  // Destroy
  p.log.step("Running pulumi destroy...");
  console.log();
  const exitCode = await pulumiDestroy();
  console.log();

  if (exitCode !== 0) {
    exitWithError("Destruction failed. Check the output above for details.");
  }

  p.log.success(`Stack "${manifest.stackName}" has been destroyed.`);
  p.outro("Done!");
}
