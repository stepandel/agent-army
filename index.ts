/**
 * Agent Army - Multi-Agent Pulumi Stack
 *
 * Deploys a fleet of 3 specialized OpenClaw agents:
 * - PM (Sage): Project management, coordination, communication
 * - Eng (Atlas): Lead engineering, coding, shipping
 * - Tester (Scout): Quality assurance, verification, bug hunting
 *
 * All agents share a single VPC for cost optimization.
 * Each agent loads role-specific workspace files from presets.
 * Secrets are pulled from Pulumi ESC environment.
 */

import * as pulumi from "@pulumi/pulumi";
import * as fs from "fs";
import * as path from "path";
import { OpenClawAgent } from "./src";
import { SharedVpc } from "./shared-vpc";

// -----------------------------------------------------------------------------
// Configuration from Pulumi ESC
// -----------------------------------------------------------------------------

const config = new pulumi.Config();

// Shared configuration
const anthropicApiKey = config.requireSecret("anthropicApiKey");
const tailscaleAuthKey = config.requireSecret("tailscaleAuthKey");
const tailnetDnsName = config.require("tailnetDnsName");
const instanceType = config.get("instanceType") ?? "t3.medium";
const ownerName = config.get("ownerName") ?? "Boss";

// Per-agent Slack credentials from ESC
const pmSlackToken = config.getSecret("pmSlackToken");
const pmSlackSigningSecret = config.getSecret("pmSlackSigningSecret");
const engSlackToken = config.getSecret("engSlackToken");
const engSlackSigningSecret = config.getSecret("engSlackSigningSecret");
const testerSlackToken = config.getSecret("testerSlackToken");
const testerSlackSigningSecret = config.getSecret("testerSlackSigningSecret");

// Per-agent Linear credentials from ESC
const pmLinearToken = config.getSecret("pmLinearToken");
const engLinearToken = config.getSecret("engLinearToken");
const testerLinearToken = config.getSecret("testerLinearToken");

// -----------------------------------------------------------------------------
// Helper: Load preset workspace files from disk
// -----------------------------------------------------------------------------

function loadPresetFiles(presetDir: string, baseDir: string = "base"): Record<string, string> {
  const files: Record<string, string> = {};
  const presetsPath = path.join(__dirname, "presets");

  // Load base files first
  const basePath = path.join(presetsPath, baseDir);
  if (fs.existsSync(basePath)) {
    for (const filename of fs.readdirSync(basePath)) {
      const filePath = path.join(basePath, filename);
      if (fs.statSync(filePath).isFile()) {
        // Remove .tpl extension if present (template files)
        const outputName = filename.replace(/\.tpl$/, "");
        files[outputName] = fs.readFileSync(filePath, "utf-8");
      }
    }
  }

  // Load role-specific files (override base)
  const rolePath = path.join(presetsPath, presetDir);
  if (fs.existsSync(rolePath)) {
    for (const filename of fs.readdirSync(rolePath)) {
      const filePath = path.join(rolePath, filename);
      if (fs.statSync(filePath).isFile()) {
        files[filename] = fs.readFileSync(filePath, "utf-8");
      }
    }
  }

  return files;
}

/**
 * Process template placeholders in workspace files
 */
function processTemplates(
  files: Record<string, string>,
  variables: Record<string, string>
): Record<string, string> {
  const processed: Record<string, string> = {};

  for (const [filename, content] of Object.entries(files)) {
    let processedContent = content;
    for (const [key, value] of Object.entries(variables)) {
      processedContent = processedContent.replace(
        new RegExp(`\\{\\{${key}\\}\\}`, "g"),
        value
      );
    }
    processed[filename] = processedContent;
  }

  return processed;
}

// -----------------------------------------------------------------------------
// Resource Tags
// -----------------------------------------------------------------------------

const baseTags = {
  Project: "agent-army",
  Environment: pulumi.getStack(),
  ManagedBy: "pulumi",
};

// -----------------------------------------------------------------------------
// Shared VPC (cost optimization - all agents share one VPC)
// -----------------------------------------------------------------------------

const sharedVpc = new SharedVpc("agent-army", {
  tags: baseTags,
});

// -----------------------------------------------------------------------------
// Agent Deployments
// -----------------------------------------------------------------------------

// Load workspace files for each role
const pmFiles = processTemplates(loadPresetFiles("pm"), { OWNER_NAME: ownerName });
const engFiles = processTemplates(loadPresetFiles("eng"), { OWNER_NAME: ownerName });
const testerFiles = processTemplates(loadPresetFiles("tester"), { OWNER_NAME: ownerName });

// PM Agent (Sage)
const pmAgent = new OpenClawAgent("agent-pm", {
  anthropicApiKey,
  tailscaleAuthKey,
  tailnetDnsName,
  instanceType,

  // Use shared VPC
  vpcId: sharedVpc.vpcId,
  subnetId: sharedVpc.subnetId,
  securityGroupId: sharedVpc.securityGroupId,

  // Workspace files from presets/pm
  workspaceFiles: pmFiles,

  // Environment variables (Slack/Linear from ESC)
  envVars: {
    AGENT_ROLE: "pm",
    AGENT_NAME: "Sage",
  },

  tags: {
    ...baseTags,
    AgentRole: "pm",
    AgentName: "Sage",
  },
});

// Eng Agent (Atlas)
const engAgent = new OpenClawAgent("agent-eng", {
  anthropicApiKey,
  tailscaleAuthKey,
  tailnetDnsName,
  instanceType,

  // Use shared VPC
  vpcId: sharedVpc.vpcId,
  subnetId: sharedVpc.subnetId,
  securityGroupId: sharedVpc.securityGroupId,

  // Workspace files from presets/eng
  workspaceFiles: engFiles,

  // Environment variables
  envVars: {
    AGENT_ROLE: "eng",
    AGENT_NAME: "Atlas",
  },

  // Larger disk for engineering work
  volumeSize: 50,

  tags: {
    ...baseTags,
    AgentRole: "eng",
    AgentName: "Atlas",
  },
});

// Tester Agent (Scout)
const testerAgent = new OpenClawAgent("agent-tester", {
  anthropicApiKey,
  tailscaleAuthKey,
  tailnetDnsName,
  instanceType,

  // Use shared VPC
  vpcId: sharedVpc.vpcId,
  subnetId: sharedVpc.subnetId,
  securityGroupId: sharedVpc.securityGroupId,

  // Workspace files from presets/tester
  workspaceFiles: testerFiles,

  // Environment variables
  envVars: {
    AGENT_ROLE: "tester",
    AGENT_NAME: "Scout",
  },

  tags: {
    ...baseTags,
    AgentRole: "tester",
    AgentName: "Scout",
  },
});

// -----------------------------------------------------------------------------
// Stack Outputs (secrets are marked as such)
// -----------------------------------------------------------------------------

// VPC outputs (informational)
export const vpcId = sharedVpc.vpcId;
export const subnetId = sharedVpc.subnetId;
export const securityGroupId = sharedVpc.securityGroupId;

// PM Agent outputs
export const pmTailscaleUrl = pulumi.secret(pmAgent.tailscaleUrl);
export const pmGatewayToken = pulumi.secret(pmAgent.gatewayToken);
export const pmInstanceId = pmAgent.instanceId;
export const pmPublicIp = pmAgent.publicIp;

// Eng Agent outputs
export const engTailscaleUrl = pulumi.secret(engAgent.tailscaleUrl);
export const engGatewayToken = pulumi.secret(engAgent.gatewayToken);
export const engInstanceId = engAgent.instanceId;
export const engPublicIp = engAgent.publicIp;

// Tester Agent outputs
export const testerTailscaleUrl = pulumi.secret(testerAgent.tailscaleUrl);
export const testerGatewayToken = pulumi.secret(testerAgent.gatewayToken);
export const testerInstanceId = testerAgent.instanceId;
export const testerPublicIp = testerAgent.publicIp;

// SSH keys (secrets)
export const pmSshPrivateKey = pulumi.secret(pmAgent.sshPrivateKey);
export const engSshPrivateKey = pulumi.secret(engAgent.sshPrivateKey);
export const testerSshPrivateKey = pulumi.secret(testerAgent.sshPrivateKey);
