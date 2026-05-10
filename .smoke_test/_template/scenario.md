# Scenario template

> Copy this directory and rename to a new `<scenario_name>`. Each scenario should
> verify ONE behavior end-to-end. Keep prerequisites minimal — bigger scenarios
> become flaky.

## Description

One paragraph: what user-visible behavior does this scenario prove?

## Prerequisites (in addition to SMOKE_TEST.md §1)

- [ ] A specific Linear issue exists (give the identifier, e.g. `HJ-7`)
- [ ] Any prior state assumptions (e.g., "issue has no existing agent session", "issue is delegated to Hermes Agent")
- [ ] Required Linear scopes for this scenario (most scenarios require `write` for `agentActivityCreate`)

## Trigger

Step-by-step Linear MCP calls. Always use `mcp__plugin_linear_linear__*` so the
trigger is reproducible and doesn't depend on a human in the browser.

```
mcp__plugin_linear_linear__save_comment
  issueId: HJ-N
  body: "@hermesagent <your test prompt>"
  parentId: <optional, set to thread root for in-session follow-ups>
```

## Expected timeline

| t (relative) | What should happen |
|---|---|
| t=0 | Linear MCP returns commentId |
| t≈+0.5s | Bridge log: `POST /webhooks/linear/daapp 202` (twice — Linear sends 2 events) |
| t≈+10s  | Bridge log: `POST /api/agent-run-jobs/.../reply 200` |
| t≈+10s  | Bridge log: `linear.agent_activity.posted` (or `linear.comment.posted` if write scope absent) |
| t≈+11s  | Linear: new comment appears, authored by Hermes Agent |

## Bridge log patterns to match (use `until grep -q ... do sleep 2; done`)

Success:
```
linear.agent_activity.posted .* agentSessionId=...
linear.comment.posted .* commentId=...    # falls back when write scope missing
```

Failure (bail out and report):
```
linear.comment.failed .* "incorrect parent"
linear.agent_activity.failed
linear http 4\d\d
ELIFECYCLE
```

## Verification

```
mcp__plugin_linear_linear__list_comments
  issueId: HJ-N
  orderBy: createdAt
  limit: 5
```

Assert:
1. Exactly **one** new comment authored by `Hermes Agent` since trigger time
2. Body matches the question (specific, not the generic "test issue" boilerplate)
3. (If applicable) `cross_event_dedupe`: only one job in `/api/agent-run-jobs` for the dedupe key

## Cleanup

Most scenarios don't require cleanup — comments are idempotent test artifacts.
If your scenario creates issues (`save_issue`), note here whether you want to
archive them.

## Known weak points

Known reasons the scenario may fail intermittently. Document any flakiness here.
