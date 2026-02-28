---
name: eng-pr-testing
description: Test and validate PRs against ticket requirements. Use when a PR is ready for review — check out the branch, verify the build, run tests, and confirm all ticket acceptance criteria are met.
metadata: {"openclaw":{"emoji":"test_tube","requires":{"bins":["claude","git"]}}}
---

# PR Testing Workflow

Validate that a PR meets all requirements from its linked ticket. You are the last gate before merge.

## Before Starting

1. Read the ticket AND the PR description fully
2. Identify the acceptance criteria — explicit from the ticket, and implicit (no regressions, clean code)
3. Check out the PR branch. Pull latest.
4. When running Claude Code for any validation, **use the `coding-agent` skill patterns** — always `pty:true`, use `background:true` + `workdir` for longer tasks, monitor with `process action:log`

## Validation Checklist

Run ALL of these. If any fail, the PR does not pass.

1. **Build compiles** — no errors, no new warnings
2. **Existing tests pass** — full suite, no regressions
3. **New tests exist** — changes should have corresponding test coverage. Flag if missing.
4. **Requirements met** — verify each acceptance criterion from the ticket is actually addressed by the code
5. **Review comments addressed** — check all prior PR review comments are resolved. Use the `pr-review-resolver` skill to address outstanding comments. Unresolved comments are a blocker.
6. **No scope creep** — PR should only contain changes relevant to the ticket
7. **No junk** — no debug logs, commented-out code, leftover TODOs, unrelated formatting changes

## When Something Fails

- Be specific: what failed, what was expected, what actually happened
- Reference the exact ticket requirement that isn't met
- If tests fail, include the error output
- Post findings as a PR comment or ticket update

## When Everything Passes

- Confirm each requirement was verified and how
- Approve the PR or mark the ticket as verified
- Keep it brief — no need to narrate every line of code

## Rules of Thumb

- Don't fix issues yourself — send it back to the author with clear feedback
- If requirements are ambiguous, flag it rather than guessing whether it passes
- If the test suite doesn't cover the change adequately, call it out even if existing tests pass
- A PR that "works" but doesn't match the ticket requirements is not a pass
