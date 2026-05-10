# delegate_on_create

## Description

A new Linear issue is created with `delegate=Hermes Agent` (or assigned to
the agent on creation). Linear fires `AgentSessionEvent action=created` with
the issue's description as the implicit prompt PLUS an
`AppUserNotification action=issueDelegated`. The bridge must respond once.

This proves the **delegation** path — Linear's primary onboarding flow for
agents that "just appear and start working" on freshly-assigned issues.

## Prerequisites (beyond SMOKE_TEST.md §1)

- [ ] You're allowed to create a new test issue in the `Hj-company` team
- [ ] The agent's name in Linear is `Hermes Agent` (for the `delegate` field)

## Trigger

```
mcp__plugin_linear_linear__save_issue
  team: Hj-company
  title: "Bridge smoke test — delegate_on_create"
  description: "<a specific instruction for the agent — e.g., 'Suggest one acceptance criterion for testing a webhook bridge.'>"
  delegate: Hermes Agent
```

The `description` is what the agent should pick up as `userInstruction`
when no specific user prompt is attached (`issue.description` is the last
fallback in normalizeEvent.ts).

## Expected bridge log timeline

```
t≈0      POST /webhooks/linear/daapp 202   (×2 or ×3 — Linear may also send a "delegated" event)
t≈10s    POST /api/agent-run-jobs/<id>/reply
t≈10.4s  linear.agent_activity.posted   agentSessionId=<new-uuid>
```

If the trigger creates two distinct sessions (Linear sometimes does this for
a brand-new issue + delegate), you may see TWO `agent_activity.posted` lines
with two different sessionIds. That's a **Linear-side** quirk, not a bug.
Decide whether your scenario tolerates it; this scenario does (real-world
behavior).

## Success criteria

1. At least one `linear.agent_activity.posted` event in the bridge log
2. The created issue has at least one Hermes Agent comment whose body relates
   to the description (not generic boilerplate)
3. No `linear.*.failed` events for the issue

## Failure modes

| Symptom | Cause | Fix |
|---|---|---|
| Issue created but no webhook arrives | Linear webhook subscription doesn't include AgentSessionEvent | Re-check Linear app webhook configuration |
| Webhook arrives but normalizeEvent returns null | `action` value not handled (e.g. `issueDelegated` typo) | Check accepted action list in `normalizeEvent.ts` AppUserNotification branch |

## Cleanup

Issues created by this scenario remain in the team's backlog. Periodically
archive them via Linear UI or:
```
mcp__plugin_linear_linear__save_issue
  id: HJ-N
  state: Canceled
```

## Verified at

- 2026-05-09 — HJ-8 (commits 22e9da8 → 6212475) → "HJ-8 looks like a bridge live test for delegate-on-create behavior…"
