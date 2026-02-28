---
name: linear-ticket-prep
description: Prep Linear tickets for a coding agent. Validates sizing (splits oversized tickets into sub-issues), researches tools/APIs involved, enriches context by scanning the codebase, and generates a focused Claude Code prompt. Use when starting work on a Linear ticket or when asked to prep/triage tickets.
metadata: {"openclaw":{"emoji":"clipboard"}}
---

# Linear Ticket Prep

Prepare Linear tickets so a coding agent can execute them cleanly. Five phases: **Size, Research, Context, Prompt, Assign**.

Use the openclaw-linear plugin tools (`linear_issue_view`, `linear_issue_update`, `linear_issue_create`, `linear_comment_add`, etc.) for all API operations.

## Phase 1: Size Check

Fetch the ticket with comments and child issues. A well-sized ticket is completable in a single focused coding session (~1-4 hours of agent work).

### Existing sub-tickets
If child issues exist, fetch and read each one for context. Then use judgment:
- **Well-scoped and cover the work** — skip splitting, run Phase 2-5 per sub-ticket
- **Vague or missing detail** — enrich them in Phase 3 rather than creating new ones
- **Only cover part of the work** — create additional sub-issues for uncovered scope
- **Overlap or conflict** — update the description with a cleaner breakdown proposal
- **Parent is a tracking/epic** — treat each sub-ticket as its own prep target

### Sizing heuristics
Too large if: touches 3+ unrelated modules, has independently shippable backend+frontend work, contains multiple distinct deliverables, estimate >3 points, or uses language like "refactor entire"/"migrate all"/"rewrite".

If oversized, split into independently shippable sub-issues and update the parent description explaining the rationale.

### Sub-ticket prioritization
When a ticket has or produces multiple sub-tickets, assign each a **priority order** (P1, P2, P3...) based on:
1. **Dependency chain** — if B depends on A's output, A comes first.
2. **Foundation first** — schema changes, config, shared utilities, and type definitions before feature code.
3. **Backend before frontend** — API/data layer before UI unless the ticket is UI-only.
4. **Risk/unknowns first** — tickets with external API integration or uncertain scope earlier, so blockers surface fast.
5. **Smallest unblocking unit** — when two tickets are independent, prefer the smaller one first to build momentum and reduce WIP.

For each sub-ticket:
- Set the Linear `sortOrder` so they appear in execution order.
- Prefix the sub-ticket title with its position: `[1/N]`, `[2/N]`, etc.
- Add a **Depends on** line at the top of sub-ticket descriptions listing any prerequisite sub-ticket identifiers.
- Add a **Priority rationale** line (one sentence) explaining why this position was chosen.

## Phase 2: Research

Before enriching any ticket, research the tools, APIs, SDKs, and services the work involves. Do not guess or rely on stale knowledge.

### 2a. Identify technologies
Read the ticket description, comments, and any linked docs. List every external tool, API, SDK, library, service, or protocol mentioned or implied by the work.

### 2b. Research each technology
For each identified technology:
- **Read official documentation** — API references, quickstart guides, SDK docs. Use web search and fetch the actual doc pages.
- **Check for existing usage in the codebase** — search for imports, config files, env vars, or wrapper modules already using this technology.
- **Note version constraints** — what version is in `package.json`, `requirements.txt`, or lockfiles? Are there breaking changes between the installed version and latest?
- **Identify authentication/setup requirements** — API keys, OAuth flows, webhook registration, rate limits, required scopes.
- **Find relevant code examples** — official SDK examples for the specific endpoints or methods the ticket needs.

### 2c. Document findings
Append a **Research Notes** section to the ticket description containing:
- **APIs/SDKs involved** — name, version, link to relevant doc page
- **Key endpoints/methods** — the specific API calls or SDK methods the agent will use, with signature or URL pattern
- **Authentication** — how to authenticate, what env vars or secrets are needed
- **Rate limits & constraints** — known limits, pagination requirements, payload size caps
- **Gotchas** — common pitfalls, undocumented behavior, or breaking changes found during research
- **Existing codebase usage** — where this technology is already used and what patterns to follow

If a technology is already well-established in the codebase with clear patterns, a brief note referencing the existing usage is sufficient — focus research depth on new or unfamiliar integrations.

## Phase 3: Context Enrichment

Ensure the ticket has enough info for a coding agent to start without guessing.

### 3a. Gather context
Read the ticket description, comments, linked PRs/docs, and parent/child relationships. Then scan the codebase to find relevant files, entry points, and existing patterns.

### 3b. Update ticket description
Every ticket MUST have all of the following. If any are missing, **append to the ticket description** (preserve existing content, do not use comments).

- **Relevant file paths** the agent should modify
- **Key function/component names** to look at
- **Related code patterns** to follow for consistency
- **Edge cases** discovered while scanning
- **Dependencies** or ordering constraints
- **Definition of Done** — checkboxes with objectively verifiable conditions, not vague "works correctly" statements
- **Test Cases** — concrete input/output scenarios covering happy path, edge cases, and error cases. Check existing test files for naming conventions and patterns.

## Phase 4: Claude Code Prompt

Generate a 1-2 sentence prompt for Claude Code. It must be specific, actionable, and reference concrete file paths, function names, or line numbers — not ticket jargon.

**Formula:** [Action verb] [specific thing] in [specific location], [following pattern/constraint].

Add the prompt to the ticket description (not as a comment).

## Phase 5: Assign to Coding Agent

After the ticket is fully prepped (has research, context, DoD, test cases, and Claude Code prompt), assign it to **Titus** (the lead engineer coding agent) using the `linear_issue_update` tool.

When assigning sub-tickets, assign them all but note in the parent ticket which sub-ticket should be started first.

## Output Summary

After all phases, report:
1. **Sizing**: Well-sized or split into N sub-issues
2. **Execution order** (if sub-tickets): Ordered list with dependency rationale
3. **Research**: Technologies investigated and key findings
4. **Context added**: What was missing and enriched
5. **Definition of Done**: The checklist
6. **Test Cases**: The scenarios
7. **Claude Code prompt**: The final prompt
8. **Assigned to**: Titus

## Notes
- **Always append to the ticket description** — preserve existing content (screenshots, original context), never use comments.
- Scan the actual codebase — don't guess file paths.
- Each sub-issue must be independently mergeable. No intermediate broken states.
- If the ticket references external APIs/services, research them thoroughly in Phase 2 before writing context or prompts.
- Research depth should match integration complexity — a well-known internal pattern needs less research than a new third-party API.
