import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { resolve, join } from "path";
import * as fs from "fs";
import YAML from "yaml";
import type { ClawupManifest } from "@clawup/core";
import {
  resolveIdentityPaths,
  resolveConfigName,
  loadManifest,
  saveManifest,
  manifestExists,
  PROJECT_CONFIG_SENTINEL,
} from "../config";
import * as projectModule from "../project";

/** Helper to build a minimal valid manifest with the given identity strings. */
function makeManifest(identities: string[]): ClawupManifest {
  return {
    stackName: "test-stack",
    provider: "aws",
    region: "us-east-1",
    instanceType: "t3.medium",
    ownerName: "tester",
    agents: identities.map((identity, i) => ({
      name: `agent-${i}`,
      displayName: `Agent ${i}`,
      role: "eng",
      identity,
      volumeSize: 30,
    })),
  };
}

describe("resolveIdentityPaths", () => {
  const projectRoot = "/home/user/my-project";

  it("resolves ./ relative paths to absolute paths", () => {
    const manifest = makeManifest(["./identities/pm"]);
    const result = resolveIdentityPaths(manifest, projectRoot);

    expect(result.agents[0].identity).toBe(
      resolve(projectRoot, "./identities/pm"),
    );
    expect(result.agents[0].identity).toBe("/home/user/my-project/identities/pm");
  });

  it("resolves ../ relative paths to absolute paths", () => {
    const manifest = makeManifest(["../shared/identities/eng"]);
    const result = resolveIdentityPaths(manifest, projectRoot);

    expect(result.agents[0].identity).toBe(
      resolve(projectRoot, "../shared/identities/eng"),
    );
    expect(result.agents[0].identity).toBe("/home/user/shared/identities/eng");
  });

  it("leaves absolute paths unchanged", () => {
    const manifest = makeManifest(["/opt/identities/qa"]);
    const result = resolveIdentityPaths(manifest, projectRoot);

    expect(result.agents[0].identity).toBe("/opt/identities/qa");
  });

  it("leaves HTTPS git URLs unchanged", () => {
    const url = "https://github.com/org/identities#pm";
    const manifest = makeManifest([url]);
    const result = resolveIdentityPaths(manifest, projectRoot);

    expect(result.agents[0].identity).toBe(url);
  });

  it("leaves SSH git URLs unchanged", () => {
    const url = "git@github.com:org/identities#eng";
    const manifest = makeManifest([url]);
    const result = resolveIdentityPaths(manifest, projectRoot);

    expect(result.agents[0].identity).toBe(url);
  });

  it("handles a mix of relative, absolute, and git URL identities", () => {
    const manifest = makeManifest([
      "./identities/pm",
      "https://github.com/org/identities#eng",
      "../shared/qa",
      "/abs/path/tester",
      "git@github.com:org/ids#ops",
    ]);
    const result = resolveIdentityPaths(manifest, projectRoot);

    expect(result.agents[0].identity).toBe("/home/user/my-project/identities/pm");
    expect(result.agents[1].identity).toBe("https://github.com/org/identities#eng");
    expect(result.agents[2].identity).toBe("/home/user/shared/qa");
    expect(result.agents[3].identity).toBe("/abs/path/tester");
    expect(result.agents[4].identity).toBe("git@github.com:org/ids#ops");
  });

  it("does not mutate the original manifest", () => {
    const manifest = makeManifest(["./identities/pm"]);
    const original = manifest.agents[0].identity;
    resolveIdentityPaths(manifest, projectRoot);

    expect(manifest.agents[0].identity).toBe(original);
  });

  it("preserves all other agent fields", () => {
    const manifest = makeManifest(["./identities/pm"]);
    manifest.agents[0].envVars = { FOO: "bar" };
    manifest.agents[0].plugins = { "my-plugin": { key: "val" } };

    const result = resolveIdentityPaths(manifest, projectRoot);

    expect(result.agents[0].name).toBe("agent-0");
    expect(result.agents[0].displayName).toBe("Agent 0");
    expect(result.agents[0].role).toBe("eng");
    expect(result.agents[0].volumeSize).toBe(30);
    expect(result.agents[0].envVars).toEqual({ FOO: "bar" });
    expect(result.agents[0].plugins).toEqual({ "my-plugin": { key: "val" } });
  });
});

describe("project-mode config functions", () => {
  const fakeProjectRoot = "/tmp/clawup-test-project";
  const manifestPath = join(fakeProjectRoot, "clawup.yaml");
  const manifest = makeManifest(["./identities/pm", "https://github.com/org/ids#eng"]);

  beforeEach(() => {
    fs.mkdirSync(fakeProjectRoot, { recursive: true });
    fs.writeFileSync(manifestPath, YAML.stringify(manifest), "utf-8");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(fakeProjectRoot, { recursive: true, force: true });
  });

  describe("resolveConfigName", () => {
    it("returns sentinel when findProjectRoot() is non-null and no explicit name", () => {
      vi.spyOn(projectModule, "findProjectRoot").mockReturnValue(fakeProjectRoot);
      expect(resolveConfigName()).toBe(PROJECT_CONFIG_SENTINEL);
    });

    it("bypasses project mode when an explicit name is given", () => {
      vi.spyOn(projectModule, "findProjectRoot").mockReturnValue(fakeProjectRoot);
      // Explicit name that doesn't exist should throw — not return sentinel
      expect(() => resolveConfigName("explicit")).toThrow("Config 'explicit' not found");
    });
  });

  describe("loadManifest", () => {
    it("loads from project root and resolves relative identity paths for sentinel", () => {
      vi.spyOn(projectModule, "findProjectRoot").mockReturnValue(fakeProjectRoot);
      const result = loadManifest(PROJECT_CONFIG_SENTINEL);

      expect(result).not.toBeNull();
      expect(result!.stackName).toBe("test-stack");
      // Relative path should be resolved
      expect(result!.agents[0].identity).toBe(join(fakeProjectRoot, "identities/pm"));
      // Git URL should be unchanged
      expect(result!.agents[1].identity).toBe("https://github.com/org/ids#eng");
    });

    it("returns null when no project root found for sentinel", () => {
      vi.spyOn(projectModule, "findProjectRoot").mockReturnValue(null);
      expect(loadManifest(PROJECT_CONFIG_SENTINEL)).toBeNull();
    });
  });

  describe("saveManifest", () => {
    it("writes to project root for sentinel", () => {
      vi.spyOn(projectModule, "findProjectRoot").mockReturnValue(fakeProjectRoot);

      const updated = { ...manifest, ownerName: "updated-owner" };
      saveManifest(PROJECT_CONFIG_SENTINEL, updated);

      const raw = fs.readFileSync(manifestPath, "utf-8");
      const saved = YAML.parse(raw) as ClawupManifest;
      expect(saved.ownerName).toBe("updated-owner");
    });

    it("throws when no project root found for sentinel", () => {
      vi.spyOn(projectModule, "findProjectRoot").mockReturnValue(null);
      expect(() => saveManifest(PROJECT_CONFIG_SENTINEL, manifest)).toThrow(
        "no project root found"
      );
    });
  });

  describe("manifestExists", () => {
    it("returns true for sentinel when project root has clawup.yaml", () => {
      vi.spyOn(projectModule, "findProjectRoot").mockReturnValue(fakeProjectRoot);
      expect(manifestExists(PROJECT_CONFIG_SENTINEL)).toBe(true);
    });

    it("returns false for sentinel when no project root", () => {
      vi.spyOn(projectModule, "findProjectRoot").mockReturnValue(null);
      expect(manifestExists(PROJECT_CONFIG_SENTINEL)).toBe(false);
    });

    it("returns false for sentinel when project root has no clawup.yaml", () => {
      const emptyDir = join(fakeProjectRoot, "empty");
      fs.mkdirSync(emptyDir, { recursive: true });
      vi.spyOn(projectModule, "findProjectRoot").mockReturnValue(emptyDir);
      expect(manifestExists(PROJECT_CONFIG_SENTINEL)).toBe(false);
    });
  });
});
