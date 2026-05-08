import { eq } from "drizzle-orm";
import { type DbClient, schema } from "../db/client.js";
import type { HermesConnector } from "../hermes/connector.js";
import type { LinearWriter } from "../linear/writer.js";
import type { AppLogger } from "../logger.js";
import { buildHermesPrompt } from "../prompts/buildHermesPrompt.js";
import { newId } from "../services/ids.js";
import { appendRunnerEvent } from "./events.js";
import type { RunnerOutcome } from "./types.js";

type RunInput = {
  db: DbClient;
  logger: AppLogger;
  runnerId: string;
  agentRunJobId: string;
  connector: HermesConnector;
  writer: LinearWriter;
  agentDisplayName: string;
};

export async function runAttempt(input: RunInput): Promise<RunnerOutcome> {
  const { db, logger, runnerId, agentRunJobId } = input;
  const job = db
    .select()
    .from(schema.agentRunJobs)
    .where(eq(schema.agentRunJobs.id, agentRunJobId))
    .get();
  if (!job) throw new Error(`agent_run_job not found: ${agentRunJobId}`);

  const attemptNumber = (job.attemptCount ?? 0) + 1;
  const attemptId = newId("ra");
  const now = () => new Date().toISOString();

  db.insert(schema.runAttempts)
    .values({
      id: attemptId,
      agentRunJobId: job.id,
      agentId: job.agentId,
      agentSessionId: job.agentSessionId,
      attemptNumber,
      runnerId,
      status: "running",
      hermesSessionKey: null,
      startedAt: now(),
      heartbeatAt: now(),
      endedAt: null,
      result: null,
      error: null,
    })
    .run();

  appendRunnerEvent({
    db,
    runAttemptId: attemptId,
    agentRunJobId: job.id,
    agentSessionId: job.agentSessionId,
    eventType: "claimed",
    payload: { runnerId },
  });

  const triggerInput = job.input as {
    trigger: {
      type: "agent_session_created" | "agent_session_prompted" | "mention" | "delegation";
      linearOrganizationId: string;
      linearIssueId?: string;
      linearCommentId?: string;
      issue?: { identifier: string; title: string; url: string };
      userInstruction: string;
    };
  };

  appendRunnerEvent({
    db,
    runAttemptId: attemptId,
    agentRunJobId: job.id,
    agentSessionId: job.agentSessionId,
    eventType: "context_loaded",
    payload: { triggerType: triggerInput.trigger.type },
  });

  const issue = triggerInput.trigger.issue ?? { identifier: "?", title: "?", url: "" };
  const prompt = buildHermesPrompt({
    agentDisplayName: input.agentDisplayName,
    organizationId: triggerInput.trigger.linearOrganizationId,
    triggerType: triggerInput.trigger.type,
    issue,
    userInstruction: triggerInput.trigger.userInstruction,
    permissionPolicy: {},
  });

  appendRunnerEvent({
    db,
    runAttemptId: attemptId,
    agentRunJobId: job.id,
    agentSessionId: job.agentSessionId,
    eventType: "prompt_built",
    payload: { promptChars: prompt.length },
  });

  const ac = new AbortController();
  appendRunnerEvent({
    db,
    runAttemptId: attemptId,
    agentRunJobId: job.id,
    agentSessionId: job.agentSessionId,
    eventType: "hermes_started",
    payload: { connectorType: input.connector.type },
  });
  const result = await input.connector.run({
    agentRunJobId: job.id,
    runAttemptId: attemptId,
    agentId: job.agentId,
    prompt,
    userInstruction: triggerInput.trigger.userInstruction,
    hermesSessionKey: null,
    signal: ac.signal,
    onProgress: (ev) => {
      appendRunnerEvent({
        db,
        runAttemptId: attemptId,
        agentRunJobId: job.id,
        agentSessionId: job.agentSessionId,
        eventType: "progress",
        payload: { type: ev.type, message: ev.message ?? null },
      });
      db.update(schema.runAttempts)
        .set({ heartbeatAt: now() })
        .where(eq(schema.runAttempts.id, attemptId))
        .run();
    },
  });

  if (!result.ok) {
    db.update(schema.runAttempts)
      .set({ status: "failed", endedAt: now(), error: result.error })
      .where(eq(schema.runAttempts.id, attemptId))
      .run();
    appendRunnerEvent({
      db,
      runAttemptId: attemptId,
      agentRunJobId: job.id,
      agentSessionId: job.agentSessionId,
      eventType: "failed",
      payload: { error: result.error },
    });
    logger.warn({ tag: "runner.failed", agentRunJobId: job.id }, "attempt failed");
    return { status: "failed", error: result.error };
  }

  // Post mock comment
  const issueId = triggerInput.trigger.linearIssueId ?? "unknown_issue";
  const writeRes = await input.writer.postComment({
    agentRunJobId: job.id,
    runAttemptId: attemptId,
    organizationId: triggerInput.trigger.linearOrganizationId,
    issueId,
    body: result.output.summary,
    parentCommentId: triggerInput.trigger.linearCommentId ?? null,
  });

  if (!writeRes.ok) {
    db.update(schema.runAttempts)
      .set({ status: "failed", endedAt: now(), error: writeRes.error })
      .where(eq(schema.runAttempts.id, attemptId))
      .run();
    appendRunnerEvent({
      db,
      runAttemptId: attemptId,
      agentRunJobId: job.id,
      agentSessionId: job.agentSessionId,
      eventType: "failed",
      payload: { stage: "linear_write", error: writeRes.error },
    });
    return { status: "failed", error: writeRes.error };
  }

  appendRunnerEvent({
    db,
    runAttemptId: attemptId,
    agentRunJobId: job.id,
    agentSessionId: job.agentSessionId,
    eventType: "linear_response_posted",
    payload: { commentId: writeRes.commentId },
  });

  db.update(schema.runAttempts)
    .set({
      status: "succeeded",
      endedAt: now(),
      hermesSessionKey: result.hermesSessionKey,
      result: result.output as unknown,
    })
    .where(eq(schema.runAttempts.id, attemptId))
    .run();
  appendRunnerEvent({
    db,
    runAttemptId: attemptId,
    agentRunJobId: job.id,
    agentSessionId: job.agentSessionId,
    eventType: "completed",
    payload: { commentId: writeRes.commentId },
  });

  return {
    status: "succeeded",
    hermesSessionKey: result.hermesSessionKey,
    output: result.output,
  };
}
