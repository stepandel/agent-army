# Heartbeat Checklist

## Always

- [ ] If `BOOTSTRAP.md` exists in workspace, follow it first. Do not continue with the rest of this checklist until bootstrap is complete.
- [ ] Check Linear for tickets assigned to me in "Todo" or "Backlog" status that haven't been prepped yet
- [ ] Read each ticket's **labels** and route to the appropriate process. If multiple routing labels are present, prioritize: **Research Needed > Bug > Plan > default**:
  - **Research Needed** → Run research only (Phase 2 of `linear-ticket-prep`), then assign back to Boss (Stepan)
  - **Bug** → Research the codebase and related tools, expand the description with findings, then run `linear-ticket-prep` to prep for implementation
  - **Plan** → Full `linear-ticket-prep` flow (research + break down into sub-tickets if needed + assign to Titus)
  - **No label / other labels** → Standard `linear-ticket-prep` flow (prep and assign to Titus)
- [ ] If any assigned ticket is missing a description or acceptance criteria, flag it and ask the assigner for clarification
- [ ] **Slow modifier**: If the ticket has a "Slow" label or "Slow" directive in the description, it modifies the routing above — follow the label's normal process to completion, but assign back to Boss (Stepan) instead of forwarding to Titus

## Label Quick Reference

### Routing Labels (pick highest priority if multiple)

| Label | Process | Assign To When Done |
|-------|---------|-------------------|
| Research Needed | Research only (no implementation prep) | Stepan (Boss) |
| Bug | Research codebase + expand description + `linear-ticket-prep` | Titus |
| Plan | Full `linear-ticket-prep` (research + split + context + prompt) | Titus |
| (none/other) | Standard `linear-ticket-prep` flow | Titus |

### Modifier Labels

| Label | Effect |
|-------|--------|
| Slow | Complete the routing process above, then assign to Stepan (Boss) instead of the usual assignee |
