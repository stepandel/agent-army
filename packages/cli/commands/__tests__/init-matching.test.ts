import { describe, it, expect } from "vitest";
import { matchIdentitiesToAgents } from "../init";
import type { AgentDefinition, IdentityManifest } from "@clawup/core";

/** Minimal agent definition for testing */
function makeAgent(overrides: Partial<AgentDefinition> & Pick<AgentDefinition, "name" | "role" | "identity">): AgentDefinition {
  return {
    displayName: overrides.name,
    volumeSize: 30,
    ...overrides,
  };
}

/** Minimal discovered identity for testing */
function makeDiscovered(relPath: string, manifest: Partial<IdentityManifest> & Pick<IdentityManifest, "name" | "role">) {
  return {
    relPath,
    manifest: {
      displayName: manifest.name,
      emoji: "wrench",
      description: "test",
      volumeSize: 30,
      skills: [],
      templateVars: [],
      ...manifest,
    } as IdentityManifest,
  };
}

describe("matchIdentitiesToAgents", () => {
  it("tier 1: matches by exact identity path", () => {
    const agents = [makeAgent({ name: "agent-pm", role: "pm", identity: "./pm" })];
    const discovered = [makeDiscovered("./pm", { name: "pm", role: "pm" })];

    const result = matchIdentitiesToAgents(agents, discovered);

    expect(result.matched).toHaveLength(1);
    expect(result.matched[0].agent.name).toBe("agent-pm");
    expect(result.matched[0].discovered.relPath).toBe("./pm");
    expect(result.unmatchedAgents).toHaveLength(0);
    expect(result.unmatchedPaths).toHaveLength(0);
  });

  it("tier 2: matches by name when path differs", () => {
    const agents = [makeAgent({ name: "agent-juno", role: "pm", identity: "./old-pm" })];
    const discovered = [makeDiscovered("./new-pm", { name: "juno", role: "pm" })];

    const result = matchIdentitiesToAgents(agents, discovered);

    expect(result.matched).toHaveLength(1);
    expect(result.matched[0].agent.name).toBe("agent-juno");
    expect(result.matched[0].discovered.relPath).toBe("./new-pm");
    expect(result.unmatchedAgents).toHaveLength(0);
    expect(result.unmatchedPaths).toHaveLength(0);
  });

  it("tier 3: matches by unique role", () => {
    const agents = [makeAgent({ name: "agent-custom", role: "tester", identity: "./old-tester" })];
    const discovered = [makeDiscovered("./qa", { name: "different-name", role: "tester" })];

    const result = matchIdentitiesToAgents(agents, discovered);

    expect(result.matched).toHaveLength(1);
    expect(result.matched[0].agent.name).toBe("agent-custom");
    expect(result.matched[0].discovered.relPath).toBe("./qa");
    expect(result.unmatchedAgents).toHaveLength(0);
    expect(result.unmatchedPaths).toHaveLength(0);
  });

  it("tier 3 ambiguity: does not match when multiple agents share the same role", () => {
    const agents = [
      makeAgent({ name: "agent-eng1", role: "eng", identity: "./eng1" }),
      makeAgent({ name: "agent-eng2", role: "eng", identity: "./eng2-old" }),
    ];
    const discovered = [
      makeDiscovered("./eng-a", { name: "eng-alpha", role: "eng" }),
      makeDiscovered("./eng-b", { name: "eng-beta", role: "eng" }),
    ];

    const result = matchIdentitiesToAgents(agents, discovered);

    // Neither path nor name match, and role is ambiguous → no matches
    expect(result.matched).toHaveLength(0);
    expect(result.unmatchedAgents).toHaveLength(2);
    expect(result.unmatchedPaths).toHaveLength(2);
  });

  it("reports unmatched agents when no identity matches", () => {
    const agents = [
      makeAgent({ name: "agent-pm", role: "pm", identity: "./pm" }),
      makeAgent({ name: "agent-ghost", role: "ghost", identity: "./gone" }),
    ];
    const discovered = [makeDiscovered("./pm", { name: "pm", role: "pm" })];

    const result = matchIdentitiesToAgents(agents, discovered);

    expect(result.matched).toHaveLength(1);
    expect(result.unmatchedAgents).toHaveLength(1);
    expect(result.unmatchedAgents[0].name).toBe("agent-ghost");
    expect(result.unmatchedPaths).toHaveLength(0);
  });

  it("reports unmatched discovered identities", () => {
    const agents = [makeAgent({ name: "agent-pm", role: "pm", identity: "./pm" })];
    const discovered = [
      makeDiscovered("./pm", { name: "pm", role: "pm" }),
      makeDiscovered("./new-eng", { name: "nova", role: "eng" }),
    ];

    const result = matchIdentitiesToAgents(agents, discovered);

    expect(result.matched).toHaveLength(1);
    expect(result.unmatchedAgents).toHaveLength(0);
    expect(result.unmatchedPaths).toEqual(["./new-eng"]);
  });

  it("mixed scenario: all three tiers and unmatched on both sides", () => {
    const agents = [
      makeAgent({ name: "agent-pm", role: "pm", identity: "./pm" }),         // tier 1 match
      makeAgent({ name: "agent-juno", role: "eng", identity: "./old-eng" }), // tier 2 match (name)
      makeAgent({ name: "agent-qa", role: "tester", identity: "./old-qa" }), // tier 3 match (unique role)
      makeAgent({ name: "agent-orphan", role: "ops", identity: "./gone" }),   // no match
    ];
    const discovered = [
      makeDiscovered("./pm", { name: "pm", role: "pm" }),                     // tier 1
      makeDiscovered("./new-eng", { name: "juno", role: "eng" }),             // tier 2
      makeDiscovered("./qa-v2", { name: "tester-v2", role: "tester" }),       // tier 3
      makeDiscovered("./brand-new", { name: "newbie", role: "design" }),      // no match
    ];

    const result = matchIdentitiesToAgents(agents, discovered);

    expect(result.matched).toHaveLength(3);

    const matchedNames = result.matched.map((m) => m.agent.name).sort();
    expect(matchedNames).toEqual(["agent-juno", "agent-pm", "agent-qa"]);

    const matchedPaths = result.matched.map((m) => m.discovered.relPath).sort();
    expect(matchedPaths).toEqual(["./new-eng", "./pm", "./qa-v2"]);

    expect(result.unmatchedAgents).toHaveLength(1);
    expect(result.unmatchedAgents[0].name).toBe("agent-orphan");

    expect(result.unmatchedPaths).toEqual(["./brand-new"]);
  });

  it("prefers tier 1 over tier 2 when both could match", () => {
    // Agent identity path matches one discovered, but name matches a different one
    const agents = [makeAgent({ name: "agent-pm", role: "pm", identity: "./pm" })];
    const discovered = [
      makeDiscovered("./pm", { name: "different", role: "pm" }),      // tier 1 path match
      makeDiscovered("./other", { name: "pm", role: "something" }),   // tier 2 name match
    ];

    const result = matchIdentitiesToAgents(agents, discovered);

    expect(result.matched).toHaveLength(1);
    expect(result.matched[0].discovered.relPath).toBe("./pm");
    expect(result.unmatchedPaths).toEqual(["./other"]);
  });

  it("handles empty inputs", () => {
    expect(matchIdentitiesToAgents([], [])).toEqual({
      matched: [],
      unmatchedAgents: [],
      unmatchedPaths: [],
    });

    const agents = [makeAgent({ name: "agent-pm", role: "pm", identity: "./pm" })];
    const result = matchIdentitiesToAgents(agents, []);
    expect(result.matched).toHaveLength(0);
    expect(result.unmatchedAgents).toHaveLength(1);
  });
});
