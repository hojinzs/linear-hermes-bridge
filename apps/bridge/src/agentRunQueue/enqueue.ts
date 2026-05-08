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
  if (trigger.deliveryId) {
    return `linear:${agentId}:${trigger.deliveryId}`;
  }
  if (trigger.kind === "agent_session_created" || trigger.kind === "agent_session_prompted") {
    const promptHash = sha256(trigger.userInstruction);
    return `session:${agentId}:${trigger.agentSessionId}:${promptHash}`;
  }
  return `payload:${agentId}:${sha256(rawBody)}`;
}

function triggerType(trigger: NormalizedTrigger): string {
  return trigger.kind;
}

export function enqueueAgentRunJob(input: {
  db: DbClient;
  agentId: string;
  trigger: NormalizedTrigger;
  rawBody: string;
}): EnqueueResult {
  const key = dedupeKey(input.agentId, input.trigger, input.rawBody);
  const existing = input.db
    .select({ id: schema.agentRunJobs.id })
    .from(schema.agentRunJobs)
    .where(eq(schema.agentRunJobs.dedupeKey, key))
    .get();
  if (existing) return { status: "duplicate", agentRunJobId: existing.id };

  const now = new Date().toISOString();
  const id = newId("arj");
  const trigger = input.trigger;
  const issue = "issue" in trigger ? trigger.issue : null;
  const sessionId =
    trigger.kind === "agent_session_created" || trigger.kind === "agent_session_prompted"
      ? trigger.agentSessionId
      : null;
  input.db
    .insert(schema.agentRunJobs)
    .values({
      id,
      agentId: input.agentId,
      agentSessionId: null,
      webhookDeliveryId: null,
      dedupeKey: key,
      triggerType: triggerType(trigger),
      status: "queued",
      priority: 0,
      scheduledAt: now,
      claimedBy: null,
      claimedAt: null,
      cancelRequestedAt: null,
      attemptCount: 0,
      input: {
        agentId: input.agentId,
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
      },
      output: null,
      error: null,
      maxAttempts: 3,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return { status: "accepted", agentRunJobId: id };
}
