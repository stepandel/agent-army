import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { MANIFEST_FILE } from "@clawup/core";

// Mock the project module
vi.mock("../project", () => ({
  findProjectRoot: vi.fn(() => null),
}));

import { findProjectRoot } from "../project";
import { syncManifestToProject } from "../config";

const mockedFindProjectRoot = vi.mocked(findProjectRoot);

describe("syncManifestToProject", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "config-sync-test-"));
    mockedFindProjectRoot.mockReturnValue(null);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("copies from project root and resolves identity paths", () => {
    const projectRoot = join(tmpDir, "project");
    mkdirSync(projectRoot);
    const clawupDir = join(projectRoot, ".clawup");
    mkdirSync(clawupDir);

    // Write a manifest at project root
    const manifestContent = "stack: my-project-stack\nregion: us-east-1\n";
    writeFileSync(join(projectRoot, MANIFEST_FILE), manifestContent);

    // Set up project mode
    mockedFindProjectRoot.mockReturnValue(projectRoot);

    // Sync manifest to the .clawup/ workspace
    syncManifestToProject(clawupDir);

    // Verify the manifest was copied from project root
    const copied = readFileSync(join(clawupDir, MANIFEST_FILE), "utf-8");
    expect(copied).toBe(manifestContent);
  });

  it("throws when no project root found", () => {
    mockedFindProjectRoot.mockReturnValue(null);

    expect(() => syncManifestToProject(join(tmpDir, "dest"))).toThrow(
      "no project root found"
    );
  });

  it("uses projectDir as destination", () => {
    const projectRoot = join(tmpDir, "project");
    mkdirSync(projectRoot);
    const customDest = join(tmpDir, "custom-dest");
    mkdirSync(customDest);

    const manifestContent = "stack: test-stack\n";
    writeFileSync(join(projectRoot, MANIFEST_FILE), manifestContent);

    mockedFindProjectRoot.mockReturnValue(projectRoot);

    syncManifestToProject(customDest);

    expect(existsSync(join(customDest, MANIFEST_FILE))).toBe(true);
    const copied = readFileSync(join(customDest, MANIFEST_FILE), "utf-8");
    expect(copied).toBe(manifestContent);
  });
});
