/**
 * List project config
 */

import * as path from "path";
import { MANIFEST_FILE } from "@clawup/core";
import { loadManifest } from "../lib/config";
import { findProjectRoot } from "../lib/project";

interface ListOptions {
  json?: boolean;
}

export async function listCommand(opts: ListOptions): Promise<void> {
  const projectRoot = findProjectRoot();
  if (projectRoot === null) {
    console.log("No clawup.yaml found. Run 'clawup init' to create one, or cd into your project directory.");
    return;
  }

  const manifest = loadManifest();
  if (!manifest) {
    console.log("No clawup.yaml found. Run 'clawup init' to create one, or cd into your project directory.");
    return;
  }

  const data = {
    name: manifest.stackName,
    agents: manifest.agents.length,
    region: manifest.region ?? "-",
    stack: manifest.stackName ?? "-",
    path: path.join(projectRoot, MANIFEST_FILE),
  };

  if (opts.json) {
    console.log(JSON.stringify([data], null, 2));
    return;
  }

  // Print header
  const nameWidth = Math.max(6, data.name.length);
  const agentsWidth = 6;
  const regionWidth = Math.max(6, data.region.length);
  const stackWidth = Math.max(5, data.stack.length);

  console.log(
    `${"NAME".padEnd(nameWidth)}  ${"AGENTS".padEnd(agentsWidth)}  ${"REGION".padEnd(regionWidth)}  ${"STACK".padEnd(stackWidth)}`
  );
  console.log(
    `${"-".repeat(nameWidth)}  ${"-".repeat(agentsWidth)}  ${"-".repeat(regionWidth)}  ${"-".repeat(stackWidth)}`
  );
  console.log(
    `${data.name.padEnd(nameWidth)}  ${String(data.agents).padEnd(agentsWidth)}  ${data.region.padEnd(regionWidth)}  ${data.stack.padEnd(stackWidth)}`
  );

  console.log(`\n1 config found`);
}
