# top_level_mention

## Description

The user posts a top-level `@hermesagent` mention on an issue with **no existing
agent session thread**. Linear creates a brand-new agent session and fires
`AgentSessionEvent action=created` (no `agentActivity` block) PLUS
`AppUserNotification action=issueCommentMention`. The bridge must:

1. Extract `userInstruction` from `agentSession.comment.body` (the field `agentActivity.content.body` does NOT exist for `action=created`).
2. Resolve `sourceCommentId` from `agentSession.commentId` (which IS the user's mention comment for top-level mentions — different from `action=prompted` where it's the thread root).
3. Dedupe both webhook events to a single job.
4. Reply via `agentActivityCreate` so Linear's session UI shows "responded".

This is the test that exposed the dedupe + extraction gaps in earlier iterations
(see commit `f8526bc`).

## Prerequisites (beyond SMOKE_TEST.md §1)

- [ ] A test issue exists (e.g., `HJ-7`)
- [ ] The issue has **no** active agent session thread for `hermesagent`
      (every fresh top-level mention creates a new session, so this is fine to
       repeat — but each run produces a separate session and reply)

## Trigger

```
mcp__plugin_linear_linear__save_comment
  issueId: HJ-7
  body: "@hermesagent <a specific question that requires the actual user text — e.g., '한 줄로: 1+1은?'>"
  # NO parentId — this MUST be a top-level comment to trigger action=created
```

## Expected bridge log timeline

```
t≈0      POST /webhooks/linear/daapp 202   (×2 — both events)
t≈10s    POST /api/agent-run-jobs/<id>/reply
t≈10.4s  linear.agent_activity.posted   agentSessionId=<new-uuid>   activityId=<uuid>
t≈10.4s  POST /api/agent-run-jobs/<id>/reply 200
```

Wait pattern (background `until` loop):

```bash
until tail -50 /tmp/bridge-live.log | tr -d '\r' | grep -qE "linear.agent_activity.posted"; do sleep 2; done
```

## Success criteria

1. Bridge log shows **exactly one** `linear.agent_activity.posted` line for the new sessionId
2. Bridge log does NOT contain `linear.comment.failed` or `linear.agent_activity.failed` for this trigger
3. Linear `list_comments` for the issue shows **exactly one new** Hermes-authored comment after the trigger
4. The comment body answers the specific question (NOT a generic "test issue" boilerplate)

## Failure modes (with fixes)

| Symptom | Likely cause | Fix |
|---|---|---|
| 2 Hermes replies on the same comment | dedupe didn't collapse cross-event | Check `enqueue.ts` dedupeKey returns same key for both events; check `normalizeEvent.ts` `sourceCommentId` resolves to user's comment id for both shapes |
| Reply is generic "test issue" boilerplate | `userInstruction` empty | Check `normalizeEvent.ts` reads `session.comment.body` as fallback for `action=created` |
| `linear.agent_activity.failed` with "Invalid scope: write required" | Token missing write scope | User must re-OAuth via install URL (see SMOKE_TEST.md §1) |
| `linear.comment.failed` with "incorrect parent" | Race: mention job claimed before session event arrived AND upgrade didn't fire | Check `enqueue.ts` upgrade path in `enqueueAgentRunJob` |

## Verified at

- 2026-05-10 — HJ-7 #5 (commit f8526bc) → "한글 기본 자음 14개 + 기본 모음 10개 = 총 24개입니다."
