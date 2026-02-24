/**
 * List all saved configs in a table
 */

import * as path from "path";
import { MANIFEST_FILE } from "@clawup/core";
import { listManifests, loadManifest, configPath, PROJECT_CONFIG_SENTINEL } from "../lib/config";
import { findProjectRoot } from "../lib/project";

interface ListOptions {
  json?: boolean;
}

interface ConfigRow {
  name: string;
  agents: number;
  region: string;
  stack: string;
  path: string;
}

export async function listCommand(opts: ListOptions): Promise<void> {
  const data: ConfigRow[] = [];

  // Check for project-local config first
  const projectRoot = findProjectRoot();
  if (projectRoot !== null) {
    const manifest = loadManifest(PROJECT_CONFIG_SENTINEL);
    if (manifest) {
      data.push({
        name: `${manifest.stackName} (project)`,
        agents: manifest.agents.length,
        region: manifest.region ?? "-",
        stack: manifest.stackName ?? "-",
        path: path.join(projectRoot, MANIFEST_FILE),
      });
    }
  }

  // Add global configs
  const configs = listManifests();
  for (const name of configs) {
    const manifest = loadManifest(name);
    data.push({
      name,
      agents: manifest?.agents.length ?? 0,
      region: manifest?.region ?? "-",
      stack: manifest?.stackName ?? "-",
      path: configPath(name),
    });
  }

  if (data.length === 0) {
    console.log("No configs found. Run 'clawup init' to create one, or create a clawup.yaml in your project.");
    return;
  }

  if (opts.json) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  // Calculate column widths
  const nameWidth = Math.max(6, ...data.map((d) => d.name.length));
  const agentsWidth = 6;
  const regionWidth = Math.max(6, ...data.map((d) => d.region.length));
  const stackWidth = Math.max(5, ...data.map((d) => d.stack.length));

  // Print header
  console.log(
    `${"NAME".padEnd(nameWidth)}  ${"AGENTS".padEnd(agentsWidth)}  ${"REGION".padEnd(regionWidth)}  ${"STACK".padEnd(stackWidth)}`
  );
  console.log(
    `${"-".repeat(nameWidth)}  ${"-".repeat(agentsWidth)}  ${"-".repeat(regionWidth)}  ${"-".repeat(stackWidth)}`
  );

  // Print rows
  for (const row of data) {
    console.log(
      `${row.name.padEnd(nameWidth)}  ${String(row.agents).padEnd(agentsWidth)}  ${row.region.padEnd(regionWidth)}  ${row.stack.padEnd(stackWidth)}`
    );
  }

  console.log(`\n${data.length} config(s) found`);
}
