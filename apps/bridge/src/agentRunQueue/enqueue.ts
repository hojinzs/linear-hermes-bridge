import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { type DbClient, schema } from "../db/client.js";
import type { NormalizedTrigger } from "../linear/types.js";
import { newId } from "../services/ids.js";
import type { EnqueueResult } from "./types.js";

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

function dedupeKey(agentId: string, trigger: NormalizedTrigger, rawBody: string): string {
  // Cross-event-type dedupe: when the user posts ONE comment, Linear may fire
  // multiple webhook events that all reference the same source comment id —
  // - AppUserNotification (issueCommentMention) — has comment.body
  // - AgentSessionEvent action=created — usually NO agentActivity, no body
  // - AgentSessionEvent action=prompted — has agentActivity.content.body
  // Keying purely on sourceCommentId (without textHash) collapses all of them
  // into a single job. Comments are immutable in Linear's webhook event model
  // (edits do not re-fire), so we don't lose updates by ignoring text.
  if (trigger.sourceCommentId) {
    return `comment:${agentId}:${trigger.sourceCommentId}`;
  }
  if (trigger.deliveryId) {
    return `linear:${agentId}:${trigger.deliveryId}`;
  }
  if (trigger.kind === "agent_session_created" || trigger.kind === "agent_session_prompted") {
    const promptHash = sha256(trigger.userInstruction);
    return `session:${agentId}:${trigger.agentSessionId}:${promptHash}`;
  }
  return `payload:${agentId}:${sha256(rawBody)}`;
}

function isAgentSessionKind(kind: NormalizedTrigger["kind"]): boolean {
  return kind === "agent_session_created" || kind === "agent_session_prompted";
}

function triggerInputJson(agentId: string, trigger: NormalizedTrigger): Record<string, unknown> {
  const issue = "issue" in trigger ? trigger.issue : null;
  const sessionId = isAgentSessionKind(trigger.kind)
    ? (trigger as Extract<NormalizedTrigger, { agentSessionId: string }>).agentSessionId
    : null;
  return {
    agentId,
    trigger: {
      type: trigger.kind,
      linearOrganizationId: trigger.organizationId,
      ...(sessionId ? { linearAgentSessionId: sessionId } : {}),
      ...(issue
        ? {
            linearIssueId: issue.id,
            issue: { identifier: issue.identifier, title: issue.title, url: issue.url },
          }
        : {}),
      ...(trigger.commentId ? { linearCommentId: trigger.commentId } : {}),
      userInstruction: trigger.userInstruction,
    },
  };
}

export function enqueueAgentRunJob(input: {
  db: DbClient;
  agentId: string;
  trigger: NormalizedTrigger;
  rawBody: string;
}): EnqueueResult {
  const key = dedupeKey(input.agentId, input.trigger, input.rawBody);
  const existing = input.db
    .select()
    .from(schema.agentRunJobs)
    .where(eq(schema.agentRunJobs.dedupeKey, key))
    .get();

  // Race-resilient upgrade: when the incoming trigger is an agent_session_* event
  // but an earlier mention/delegation job already claimed the same dedupe key (and
  // hasn't started running yet), upgrade that row in place so the agent session id
  // is available to the runner. This handles Linear sending AppUserNotification
  // before AgentSessionEvent for the same user comment.
  if (existing) {
    const incomingIsSession = isAgentSessionKind(input.trigger.kind);
    const existingIsSession =
      existing.triggerType === "agent_session_created" ||
      existing.triggerType === "agent_session_prompted";
    if (incomingIsSession && !existingIsSession && existing.status === "queued") {
      input.db
        .update(schema.agentRunJobs)
        .set({
          triggerType: input.trigger.kind,
          input: triggerInputJson(input.agentId, input.trigger),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(schema.agentRunJobs.id, existing.id))
        .run();
      return { status: "accepted", agentRunJobId: existing.id };
    }
    return { status: "duplicate", agentRunJobId: existing.id };
  }

  const now = new Date().toISOString();
  const id = newId("arj");
  input.db
    .insert(schema.agentRunJobs)
    .values({
      id,
      agentId: input.agentId,
      agentSessionId: null,
      webhookDeliveryId: null,
      dedupeKey: key,
      triggerType: input.trigger.kind,
      status: "queued",
      priority: 0,
      scheduledAt: now,
      claimedBy: null,
      claimedAt: null,
      cancelRequestedAt: null,
      attemptCount: 0,
      input: triggerInputJson(input.agentId, input.trigger),
      output: null,
      error: null,
      maxAttempts: 3,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return { status: "accepted", agentRunJobId: id };
}
