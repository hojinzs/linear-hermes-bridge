# cross_event_dedupe

## Description

Linear fires **two webhook events for one user comment**:

1. `AgentSessionEvent` (action=created or prompted)
2. `AppUserNotification` (action=issueCommentMention)

Both reference the same user comment. The bridge must collapse them into a
**single job** so Hermes runs once and only one reply is posted.

This scenario specifically asserts the dedupe — independent of whether the
trigger is top-level or in-thread.

## Prerequisites (beyond SMOKE_TEST.md §1)

- [ ] An issue exists (any one — `HJ-7`, `HJ-8`, etc. works)
- [ ] Bridge log file is fresh-tail-able (`tail -f /tmp/bridge-live.log`)

## Trigger

Either flavor (top-level or follow-up) — pick one:

```
# top-level (new session)
mcp__plugin_linear_linear__save_comment
  issueId: HJ-7
  body: "@hermesagent dedupe test #N"
```

OR

```
# in-thread (existing session)
mcp__plugin_linear_linear__save_comment
  issueId: HJ-8
  parentId: 8262b0e0-be43-442e-b870-ccfccd0d7180
  body: "@hermesagent dedupe test #N"
```

Use a unique suffix per run (`#N`) so older comments don't pollute results.

## Expected bridge log

```
POST /webhooks/linear/daapp 202   ← first event (e.g., AppUserNotification)
POST /webhooks/linear/daapp 202   ← second event (AgentSessionEvent or vice versa)
                                    BOTH return 202 — that's the route's status,
                                    not a dedupe signal. The signal is in the
                                    JSON body, where the second one says
                                    {"status":"duplicate","agentRunJobId":"<existing>"}
                                    OR is upgraded in place if mention→session.

POST /api/agent-run-jobs/<id>/reply  ← ONE reply, not two
linear.agent_activity.posted          ← ONE activity, not two
```

Crucially: **only one** `agentRunJobId` should appear in subsequent reply /
agent_activity / comment events. Use:

```bash
# count distinct job ids touched in the last 60s for this trigger
tail -100 /tmp/bridge-live.log | tr -d '\r' \
  | grep -E "1778[0-9]{6}" | grep -oE 'arj_[A-Za-z0-9_-]+' | sort -u
```

## Success criteria

1. **Exactly one** `arj_*` id appears in `linear.agent_activity.posted` /
   `linear.comment.posted` events for this trigger
2. **Exactly one** new Hermes-authored comment in Linear after the trigger

## Failure modes

| Symptom | Cause | Fix |
|---|---|---|
| 2 distinct `arj_*` ids touched | dedupe key mismatch — sourceCommentId resolves differently between events | Re-check `normalizeEvent.ts` sourceCommentId resolution; capture raw bodies via `LHB_DEBUG_WEBHOOK_LOG` to compare |
| 1 job, but `linear.comment.failed: incorrect parent` | mention job claimed first, agent_session arrived too late to upgrade | Verify `enqueue.ts` upgrade path; ensure mention job's status was still `queued` when session event arrived (orchestrator pollIntervalMs ≈ 250ms) |

## Verified at

- 2026-05-10 — HJ-8 #12 (commit fb0ccb2) — 2 webhooks accepted, 1 job, 1 activity
