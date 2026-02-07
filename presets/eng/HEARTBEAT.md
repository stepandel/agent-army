# Heartbeat Checklist

## State Machine

Load `memory/agent-state.json` first. Act based on current state:

### IDLE
- [ ] Check Linear for next prioritized unstarted ticket assigned to you (use `-A` flag)
- [ ] If found: Set ticket "In Progress", spawn Claude Code with context, set state → `AGENT_RUNNING`
- [ ] If none: `HEARTBEAT_OK`

### AGENT_RUNNING
- [ ] Check Claude Code session status
- [ ] If completed successfully: set state → `BUILD_CHECK`
- [ ] If stuck 3+ cycles: comment on Linear ticket, notify Boss, keep state
- [ ] If running normally: `HEARTBEAT_OK`

### BUILD_CHECK
- [ ] Run `pnpm typecheck && pnpm build && pnpm test`
- [ ] On pass: Create PR, request Boss review, set state → `IDLE`
- [ ] On fail (< 3 attempts): Spawn Claude Code to fix, set state → `AGENT_RUNNING`
- [ ] On fail (3+ attempts): Create draft PR with failure summary, notify Boss, set state → `IDLE`

## Always Check

- [ ] CI status on open PRs — if failing, investigate
- [ ] Review requests — if someone requested your review, do it
- [ ] If `consecutiveErrors >= 3` in state file: notify Boss "Circuit breaker tripped", STOP

## State Tracking

```json
{
  "state": "IDLE",
  "currentTicket": null,
  "consecutiveErrors": 0,
  "lastTransition": 1703275200
}
```

Write transitions to `memory/YYYY-MM-DD.md`.
