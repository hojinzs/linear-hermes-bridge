# in_thread_followup

## Description

The user posts a follow-up `@hermesagent` mention **inside an existing agent
session thread** (i.e., as a reply to the session's "This thread is for an
agent session..." root comment). Linear fires
`AgentSessionEvent action=prompted` (with full `agentActivity.content.body`)
PLUS `AppUserNotification action=issueCommentMention`. The bridge must:

1. Extract `userInstruction` from `agentActivity.content.body`.
2. Resolve `sourceCommentId` from `agentActivity.sourceCommentId`.
3. Dedupe both webhook events to a single job.
4. Reply via `agentActivityCreate` (continues the same session).

This is the easy case — the `agentActivity` block carries everything.

## Prerequisites (beyond SMOKE_TEST.md §1)

- [ ] A test issue exists with **at least one prior** Hermes Agent session thread
- [ ] You know the **session-thread root commentId** to use as `parentId`
- [ ] In `HJ-7`, the root for the original session is `946a6f19-a982-42e9-baec-d5432cdf4d16`
- [ ] In `HJ-8`, the root for the original session is `8262b0e0-be43-442e-b870-ccfccd0d7180`

If you don't know the root commentId, run `top_level_mention` first to create
one, then list comments and find the comment authored by `null` whose body is
"This thread is for an agent session with hermesagent."

## Trigger

```
mcp__plugin_linear_linear__save_comment
  issueId: HJ-8
  parentId: 8262b0e0-be43-442e-b870-ccfccd0d7180   # session thread root for HJ-8
  body: "@hermesagent <specific question — e.g., '한 줄로: GraphQL과 REST API의 가장 큰 차이는?'>"
```

## Expected bridge log timeline

```
t≈0      POST /webhooks/linear/daapp 202   (×2)
t≈10s    POST /api/agent-run-jobs/<id>/reply
t≈10.4s  linear.agent_activity.posted   agentSessionId=<existing-uuid>   activityId=<uuid>
t≈10.4s  POST /api/agent-run-jobs/<id>/reply 200
```

## Success criteria

1. Bridge log: one `linear.agent_activity.posted` for the **existing** sessionId (not a new one)
2. Linear: one new Hermes-authored comment, body answers the specific question
3. The reply appears INSIDE the session thread (Linear UI: indented under the root)

## Failure modes (with fixes)

| Symptom | Cause | Fix |
|---|---|---|
| New session created instead of continuing | `parentId` was wrong (not the session root) | Re-list comments, pick the actual root |
| 2 jobs / 2 replies | dedupe regression | See `top_level_mention` failure modes — same root cause |
| Generic answer, not specific | `agentActivity.content.body` not extracted | Check `normalizeEvent.ts` priority order |

## Verified at

- 2026-05-10 — HJ-8 #12 (commit f8526bc) → "GraphQL은 클라이언트가 필요한 데이터 구조와 필드를 정확히 지정해…"
