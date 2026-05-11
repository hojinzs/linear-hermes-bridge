import { and, eq, lte, sql } from "drizzle-orm";
import { type DbClient, schema } from "../db/client.js";
import type { HermesConnector } from "../hermes/connector.js";
import type { LinearWriter } from "../linear/writer.js";
import type { AppLogger } from "../logger.js";
import { runAttempt } from "../runner/agentRunner.js";
import type { AgentService } from "../services/agents.js";
import type { OrchestratorConfig } from "./types.js";

type TickInput = {
  db: DbClient;
  logger: AppLogger;
  runnerId: string;
  config: OrchestratorConfig;
  agentService: AgentService;
  workspaceRoot: string;
  buildConnector: (agent: {
    hermesConnectorType: string;
    hermesConnectorConfig: unknown;
  }) => HermesConnector;
  buildWriter: (input: { logger: AppLogger; agentId: string }) => LinearWriter;
};

export async function runOrchestratorTick(input: TickInput): Promise<void> {
  const now = new Date().toISOString();

  // 1) reconcile stale claimed/running attempts
  const heartbeatThreshold = new Date(Date.now() - input.config.heartbeatTimeoutMs).toISOString();
  const staleAttempts = input.db
    .select()
    .from(schema.runAttempts)
    .where(
      and(
        eq(schema.runAttempts.status, "running"),
        lte(schema.runAttempts.heartbeatAt, heartbeatThreshold),
      ),
    )
    .all();
  for (const a of staleAttempts) {
    input.db
      .update(schema.runAttempts)
      .set({ status: "timed_out", endedAt: now, error: "heartbeat timeout" })
      .where(eq(schema.runAttempts.id, a.id))
      .run();
  }

  // 2) handle cancel_requested_at on queued jobs (no attempt yet) — straight to canceled
  const cancelQueued = input.db
    .select()
    .from(schema.agentRunJobs)
    .where(eq(schema.agentRunJobs.status, "queued"))
    .all()
    .filter((j) => j.cancelRequestedAt);
  for (const j of cancelQueued) {
    input.db
      .update(schema.agentRunJobs)
      .set({ status: "canceled", updatedAt: now })
      .where(eq(schema.agentRunJobs.id, j.id))
      .run();
  }

  // 3) claim eligible queued jobs respecting concurrency
  const queued = input.db
    .select()
    .from(schema.agentRunJobs)
    .where(eq(schema.agentRunJobs.status, "queued"))
    .all()
    .filter((j) => j.scheduledAt <= now)
    .sort((a, b) => b.priority - a.priority || a.scheduledAt.localeCompare(b.scheduledAt));

  const concurrentByAgent = new Map<string, number>();
  for (const row of input.db.select().from(schema.agentRunJobs).all()) {
    if (row.status === "running" || row.status === "claimed") {
      concurrentByAgent.set(row.agentId, (concurrentByAgent.get(row.agentId) ?? 0) + 1);
    }
  }

  for (const job of queued) {
    const agentRow = input.db
      .select()
      .from(schema.agents)
      .where(eq(schema.agents.id, job.agentId))
      .get();
    if (!agentRow || !agentRow.enabled) continue;
    const inFlight = concurrentByAgent.get(job.agentId) ?? 0;
    if (inFlight >= agentRow.maxConcurrentRuns) continue;

    // claim
    const newAttemptCount = (job.attemptCount ?? 0) + 1;
    const claimed = input.db
      .update(schema.agentRunJobs)
      .set({
        status: "claimed",
        claimedBy: input.runnerId,
        claimedAt: now,
        attemptCount: newAttemptCount,
        updatedAt: now,
      })
      .where(and(eq(schema.agentRunJobs.id, job.id), eq(schema.agentRunJobs.status, "queued")))
      .run();
    if (claimed.changes === 0) continue;
    concurrentByAgent.set(job.agentId, inFlight + 1);

    // run synchronously inside the tick
    const agent = await input.agentService.getBySlugWithSecrets(agentRow.slug);
    if (!agent) {
      input.db
        .update(schema.agentRunJobs)
        .set({ status: "failed", error: "agent missing", updatedAt: new Date().toISOString() })
        .where(eq(schema.agentRunJobs.id, job.id))
        .run();
      continue;
    }
    const connector = input.buildConnector({
      hermesConnectorType: agent.hermesConnectorType,
      hermesConnectorConfig: agent.hermesConnectorConfig,
    });
    const writer = input.buildWriter({ logger: input.logger, agentId: agent.id });

    input.db
      .update(schema.agentRunJobs)
      .set({ status: "running", updatedAt: new Date().toISOString() })
      .where(eq(schema.agentRunJobs.id, job.id))
      .run();

    let outcome: Awaited<ReturnType<typeof runAttempt>>;
    try {
      outcome = await runAttempt({
        db: input.db,
        logger: input.logger,
        runnerId: input.runnerId,
        agentRunJobId: job.id,
        connector,
        writer,
        agentDisplayName: agent.displayName,
        agentSlug: agent.slug,
        workspaceRoot: input.workspaceRoot,
      });
    } catch (e) {
      outcome = { status: "failed" as const, error: (e as Error).message };
    }

    finalizeJobStatus(input.db, job.id, outcome, input.config);
  }

  // suppress unused-import warning for sql
  void sql;
}

function finalizeJobStatus(
  db: DbClient,
  jobId: string,
  outcome: { status: string; error?: string },
  config: OrchestratorConfig,
): void {
  const job = db.select().from(schema.agentRunJobs).where(eq(schema.agentRunJobs.id, jobId)).get();
  if (!job) return;
  const now = new Date().toISOString();

  if (outcome.status === "succeeded") {
    db.update(schema.agentRunJobs)
      .set({ status: "succeeded", updatedAt: now })
      .where(eq(schema.agentRunJobs.id, jobId))
      .run();
    return;
  }
  if (outcome.status === "awaiting_input") {
    db.update(schema.agentRunJobs)
      .set({ status: "awaiting_input", updatedAt: now })
      .where(eq(schema.agentRunJobs.id, jobId))
      .run();
    return;
  }
  if (outcome.status === "canceled") {
    db.update(schema.agentRunJobs)
      .set({ status: "canceled", updatedAt: now })
      .where(eq(schema.agentRunJobs.id, jobId))
      .run();
    return;
  }
  // failed / timed_out
  if ((job.attemptCount ?? 0) >= job.maxAttempts) {
    db.update(schema.agentRunJobs)
      .set({ status: "failed", error: outcome.error ?? null, updatedAt: now })
      .where(eq(schema.agentRunJobs.id, jobId))
      .run();
    return;
  }
  // schedule retry
  const backoff = Math.min(
    config.retryBackoffMaxMs,
    config.retryBackoffMinMs * 2 ** Math.max(0, (job.attemptCount ?? 0) - 1),
  );
  const next = new Date(Date.now() + backoff).toISOString();
  db.update(schema.agentRunJobs)
    .set({
      status: "queued",
      scheduledAt: next,
      claimedBy: null,
      claimedAt: null,
      error: outcome.error ?? null,
      updatedAt: now,
    })
    .where(eq(schema.agentRunJobs.id, jobId))
    .run();
}

export function startOrchestrator(input: TickInput & { stopSignal: AbortSignal }): Promise<void> {
  return new Promise((resolve) => {
    const interval = setInterval(async () => {
      try {
        await runOrchestratorTick(input);
      } catch (e) {
        input.logger.error({ tag: "orchestrator.tick", err: (e as Error).message }, "tick error");
      }
    }, input.config.pollIntervalMs);
    input.stopSignal.addEventListener("abort", () => {
      clearInterval(interval);
      resolve();
    });
  });
}
