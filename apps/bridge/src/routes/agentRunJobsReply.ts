import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { type DbClient, schema } from "../db/client.js";
import type { LinearWriter } from "../linear/writer.js";
import type { AppLogger } from "../logger.js";
import { appendRunnerEvent } from "../runner/events.js";

function verifyHmacSha256(rawBody: string, signatureHeader: string, secret: string): boolean {
  if (!signatureHeader || !secret) return false;
  const candidate = signatureHeader.startsWith("sha256=")
    ? signatureHeader.slice("sha256=".length)
    : signatureHeader;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  if (expected.length !== candidate.length) return false;
  return timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(candidate, "utf8"));
}

export type AgentRunJobsReplyDeps = {
  db: DbClient;
  logger: AppLogger;
  buildWriter: (input: { logger: AppLogger; agentId: string }) => LinearWriter;
  // The HMAC secret comes from the agent's hermesConnectorConfig.hmacSecret.
  // We resolve it via a lookup here to keep this route stateless.
  resolveHermesHmacSecret: (agentId: string) => Promise<string | null>;
};

export function agentRunJobsReplyRoutes(deps: AgentRunJobsReplyDeps) {
  const { db, logger, buildWriter, resolveHermesHmacSecret } = deps;
  const app = new Hono();

  app.post("/:id/reply", async (c) => {
    const id = c.req.param("id");
    const job = db.select().from(schema.agentRunJobs).where(eq(schema.agentRunJobs.id, id)).get();
    if (!job) return c.json({ error: "not_found" }, 404);

    const rawBody = await c.req.text();
    const sigHeader =
      c.req.header("x-hub-signature-256") ?? c.req.header("x-webhook-signature") ?? "";

    const secret = await resolveHermesHmacSecret(job.agentId);
    if (!secret) return c.json({ error: "no_hmac_secret_configured" }, 500);
    if (!verifyHmacSha256(rawBody, sigHeader, secret)) {
      return c.json({ error: "invalid_signature" }, 401);
    }

    let payload: { summary?: unknown; events?: unknown; meta?: unknown };
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return c.json({ error: "invalid_json" }, 400);
    }

    const summary = typeof payload.summary === "string" ? payload.summary : "";
    if (!summary) return c.json({ error: "missing_summary" }, 400);

    if (job.status !== "awaiting_input" && job.status !== "running" && job.status !== "claimed") {
      return c.json(
        {
          error: "wrong_state",
          jobStatus: job.status,
          note: "reply only valid when job is awaiting_input",
        },
        409,
      );
    }

    const triggerInput = job.input as {
      trigger: {
        linearOrganizationId: string;
        linearIssueId?: string;
        linearCommentId?: string;
        linearAgentSessionId?: string;
      };
    };
    const issueId = triggerInput.trigger.linearIssueId ?? "unknown_issue";
    const orgId = triggerInput.trigger.linearOrganizationId;

    // Find the latest run_attempt for this job (the one that's awaiting_input).
    const latestAttempt = db
      .select()
      .from(schema.runAttempts)
      .where(eq(schema.runAttempts.agentRunJobId, id))
      .all()
      .sort((a, b) => b.attemptNumber - a.attemptNumber)[0];

    const writer = buildWriter({ logger, agentId: job.agentId });
    const writeRes = await writer.postComment({
      agentRunJobId: job.id,
      runAttemptId: latestAttempt?.id ?? "unknown",
      organizationId: orgId,
      issueId,
      body: summary,
      parentCommentId: triggerInput.trigger.linearCommentId ?? null,
      agentSessionId: triggerInput.trigger.linearAgentSessionId ?? null,
    });

    const now = new Date().toISOString();
    if (!writeRes.ok) {
      db.update(schema.agentRunJobs)
        .set({ status: "failed", error: writeRes.error, updatedAt: now })
        .where(eq(schema.agentRunJobs.id, id))
        .run();
      if (latestAttempt) {
        db.update(schema.runAttempts)
          .set({ status: "failed", endedAt: now, error: writeRes.error })
          .where(eq(schema.runAttempts.id, latestAttempt.id))
          .run();
        appendRunnerEvent({
          db,
          runAttemptId: latestAttempt.id,
          agentRunJobId: id,
          agentSessionId: job.agentSessionId,
          eventType: "failed",
          payload: { stage: "linear_write_via_reply", error: writeRes.error },
        });
      }
      return c.json({ error: "linear_write_failed", detail: writeRes.error }, 502);
    }

    if (latestAttempt) {
      db.update(schema.runAttempts)
        .set({
          status: "succeeded",
          endedAt: now,
          result: { summary, events: payload.events ?? [] } as unknown,
        })
        .where(eq(schema.runAttempts.id, latestAttempt.id))
        .run();
      appendRunnerEvent({
        db,
        runAttemptId: latestAttempt.id,
        agentRunJobId: id,
        agentSessionId: job.agentSessionId,
        eventType: "linear_response_posted",
        payload: { commentId: writeRes.commentId, source: "reply_callback" },
      });
      appendRunnerEvent({
        db,
        runAttemptId: latestAttempt.id,
        agentRunJobId: id,
        agentSessionId: job.agentSessionId,
        eventType: "completed",
        payload: { commentId: writeRes.commentId, viaReply: true },
      });
    }
    db.update(schema.agentRunJobs)
      .set({ status: "succeeded", updatedAt: now })
      .where(eq(schema.agentRunJobs.id, id))
      .run();

    return c.json({ ok: true, commentId: writeRes.commentId });
  });

  return app;
}
