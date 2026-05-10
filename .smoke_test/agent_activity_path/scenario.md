# agent_activity_path

## Description

For agent_session_* triggers, the bridge must use Linear's
`agentActivityCreate` mutation (not just `commentCreate`) so:

1. Linear's Agent Session UI transitions to **"responded"** state (otherwise
   it stays at "did not respond" even with a comment posted).
2. No duplicate comment is produced (the activity itself shows up as a comment
   in the issue thread automatically).

This scenario verifies the writer's preferred path is taken when the OAuth
token has the `write` scope.

## Prerequisites (beyond SMOKE_TEST.md §1)

- [ ] OAuth token includes `write` scope. Verify:
  ```bash
  curl -sS http://127.0.0.1:8787/api/agents/daapp/installations \
    | python3 -c "import sys, json; print('write' in json.load(sys.stdin)['installations'][0]['scopes'])"
  # expect: True
  ```
- [ ] Pick a trigger flavor — top_level_mention or in_thread_followup. This
      scenario doesn't care which, only that the trigger is an agent_session_*.

## Trigger

(Same as `top_level_mention` or `in_thread_followup`. Re-use one of those.)

## Expected bridge log

```
linear.agent_activity.posted   agentSessionId=...   activityId=...
```

**Crucially absent:** `linear.comment.posted` for the same `agentRunJobId`.
The writer returns immediately after `agentActivityCreate` succeeds.

## Success criteria

1. `linear.agent_activity.posted` line present with non-empty `activityId`
2. `linear.comment.posted` line for the same job is **absent** (the activity
   alone is the reply; Linear renders it as a comment automatically)
3. Linear `list_comments` shows **one** new Hermes Agent comment, not two
4. Linear's Agent Session view (browser) shows the session marked as
   "responded" (manual visual check; the API doesn't expose session state
   string directly — confirm by absence of "Did not respond" pill)

## Failure modes

| Symptom | Cause | Fix |
|---|---|---|
| `linear.agent_activity.failed: Invalid scope: write required` | Token missing write | User re-OAuths at `/oauth/authorize/daapp` |
| Both `agent_activity.posted` AND `comment.posted` for same job | Bridge double-writing | Check `linearWriter.ts` returns immediately after activity success — should NOT fall through to commentCreate |
| `agent_activity.posted` but Linear UI still shows "did not respond" | Linear UI may need refresh, or activity content payload shape changed | Refresh; introspect `AgentActivityCreateInput` schema for changes |

## Verified at

- 2026-05-10 — HJ-8 #12 (commit fb0ccb2) → activity `22dbec64-…`, no backing comment, Linear UI marked "responded"
