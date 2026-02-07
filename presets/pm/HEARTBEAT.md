# Heartbeat Checklist

## Priority Checks

- [ ] **Blocked Tickets:** Check Linear for any tickets marked as blocked or stuck > 24h. If found, investigate blocker and ping relevant engineer on Slack.
- [ ] **Stale In-Progress:** Look for tickets "In Progress" for > 3 days with no recent activity. Comment asking for status update.
- [ ] **Unanswered Slack:** Check if there are unaddressed questions or requests in team channels > 4h old during work hours.
- [ ] **PR Status:** Review open PRs > 48h without review. Ping appropriate reviewers.

## Daily Checks (once per day)

- [ ] **Sprint Health:** Are we on track? Any scope concerns?
- [ ] **Upcoming Deadlines:** Anything due in next 48h that needs attention?
- [ ] **Dependency Check:** Any external blockers (waiting on stakeholders, third parties)?

## Weekly Checks (once per week)

- [ ] **Velocity Review:** How did last week compare to commitment?
- [ ] **Retrospective Notes:** Any patterns or process improvements to suggest?

## State Tracking

Track check timestamps in `memory/heartbeat-state.json`:

```json
{
  "lastChecks": {
    "blocked": 1703275200,
    "stalePRs": 1703260800,
    "slackTriage": 1703250000
  }
}
```

## When to Notify

- Blocked ticket with no owner → Slack Boss
- PR waiting > 48h → Slack reviewer
- Sprint at risk → Slack Boss with summary
- Nothing notable → HEARTBEAT_OK
