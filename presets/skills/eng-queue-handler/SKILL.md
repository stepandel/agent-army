---
name: eng-queue-handler
description: Handle a ticket from the Linear queue as the Engineering agent. Delegates implementation to Claude Code, monitors progress, and manages the ticket lifecycle. Triggered by the openclaw-linear plugin when a ticket enters Titus's queue.
metadata: {"openclaw":{"emoji":"📥"}}
user-invocable: false
---

# Eng Queue Handler

Process a ticket that has arrived in your Linear queue. Your role is to manage the ticket lifecycle and delegate implementation to the coding agent.

## Steps

1. **View the ticket** — Use `linear_issue_view` to read the full ticket: description, acceptance criteria, Claude Code prompt, file paths, and any sub-ticket dependencies.

2. **Start work** — Use `linear_issue_update` to set the ticket to "In Progress". Pop the ticket from your queue with `linear_queue`.

3. **Delegate to Claude Code** — Spawn Claude Code with the ticket's Claude Code prompt (or build one from the description if none exists). Let it handle the implementation — do not code directly.

4. **Monitor execution** — Watch for progress. If Claude Code is stuck for 3+ heartbeat cycles, use `linear_comment_add` to note the blocker on the ticket and notify {{OWNER_NAME}} on Slack.

5. **Verify and ship** — When Claude Code completes, run build/test checks in the project directory.
   - **Pass** → Create a PR, assign Scout as reviewer. Use `linear_issue_update` to move the ticket to "In Review" and assign Scout. Use `linear_comment_add` to post the PR link on the ticket.
   - **Fail (< 3 attempts)** → Spawn Claude Code to fix the errors and re-run.
   - **Fail (3+ attempts)** → Create a draft PR with a failure summary. Use `linear_comment_add` to post the draft PR link on the ticket.

6. **Handle blocks** — If a ticket is blocked by another ticket's unmerged PR, wait. When the blocking PR merges, rebase and continue.

## Notes

- Always use the ticket's Claude Code prompt if one was provided during prep. Fall back to building a prompt from the description.
- Each sub-ticket should be implemented independently and result in its own PR.
