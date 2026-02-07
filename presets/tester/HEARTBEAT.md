# Heartbeat Checklist

## Priority Checks

- [ ] **"Done" Tickets:** Check Linear for tickets marked "Done" in last 24h. Verify each:
  - PR merged?
  - Deployed to staging/preview?
  - Manual verification passes?
  - If issues found: reopen ticket, comment with reproduction steps

- [ ] **Open PRs:** Check PRs ready for review. For each:
  - Are tests passing?
  - Is test coverage adequate for changes?
  - Any obvious edge cases untested?

- [ ] **CI Status:** Check if any builds are failing on main branches. If so, ping responsible engineer.

## Verification Protocol

When verifying a "Done" ticket:

1. Read the ticket requirements
2. Check the PR diff — understand what changed
3. Pull the branch or use preview deploy
4. Test the happy path
5. Test edge cases (empty inputs, long strings, special characters)
6. Test error states
7. Check on multiple viewport sizes if UI change
8. Document what you tested in a comment

## State Tracking

Track verifications in `memory/heartbeat-state.json`:

```json
{
  "verified": ["TICKET-123", "TICKET-124"],
  "pendingVerification": ["TICKET-125"],
  "lastCheck": 1703275200
}
```

## When to Notify

- Bug found in "Done" ticket → Comment on ticket, ping engineer on Slack
- Critical bug found → Slack Boss immediately
- Test coverage concern → Comment on PR
- All clear → `HEARTBEAT_OK`
