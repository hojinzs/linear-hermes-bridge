import { randomBytes } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import { createDb, schema } from "../db/client.js";
import { mockConnector } from "../hermes/mockConnector.js";
import { mockWriter } from "../linear/mockWriter.js";
import { createLogger } from "../logger.js";
import { createAgentService } from "../services/agents.js";
import { runOrchestratorTick } from "./claimLoop.js";
import { DEFAULT_ORCHESTRATOR_CONFIG } from "./types.js";

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), "..", "db", "migrations");

async function setup() {
  const dir = mkdtempSync(join(tmpdir(), "lhb-orch-"));
  const { db } = createDb(`file:${join(dir, "t.db")}`);
  migrate(db, { migrationsFolder });
  const svc = createAgentService({ db, encryptionKey: randomBytes(32) });
  const agent = await svc.create({
    slug: "mock",
    displayName: "Mock",
    description: null,
    iconUrl: null,
    linearClientId: "c",
    linearClientSecret: "cs",
    linearWebhookSecret: "ws",
    requiredScopes: ["read"],
    hermesConnectorType: "mock",
    hermesConnectorConfig: { kind: "mock" },
    permissionPolicy: {},
  });
  const logger = createLogger({ level: "fatal" });
  return { db, svc, agent, logger };
}

function insertJob(
  db: ReturnType<typeof createDb>["db"],
  agentId: string,
  overrides: Partial<typeof schema.agentRunJobs.$inferInsert> = {},
) {
  const now = new Date().toISOString();
  const id = `arj_${Math.random().toString(36).slice(2, 10)}`;
  db.insert(schema.agentRunJobs)
    .values({
      id,
      agentId,
      agentSessionId: null,
      webhookDeliveryId: null,
      dedupeKey: `dk_${id}`,
      triggerType: "agent_session_prompted",
      status: "queued",
      priority: 0,
      scheduledAt: now,
      claimedBy: null,
      claimedAt: null,
      cancelRequestedAt: null,
      attemptCount: 0,
      input: {
        agentId,
        trigger: {
          type: "agent_session_prompted",
          linearOrganizationId: "org",
          linearAgentSessionId: "s",
          linearIssueId: "i",
          issue: { identifier: "X-1", title: "t", url: "https://x" },
          userInstruction: "u",
        },
      },
      output: null,
      error: null,
      maxAttempts: 3,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    })
    .run();
  return id;
}

describe("orchestrator tick", () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    ctx = await setup();
  });

  it("claims a queued job, runs it, and marks the job succeeded", async () => {
    const id = insertJob(ctx.db, ctx.agent.id);
    await runOrchestratorTick({
      db: ctx.db,
      logger: ctx.logger,
      runnerId: "test-runner",
      config: DEFAULT_ORCHESTRATOR_CONFIG,
      agentService: ctx.svc,
      buildConnector: () => mockConnector(),
      buildWriter: (logger) => mockWriter(logger),
    });
    const job = ctx.db
      .select()
      .from(schema.agentRunJobs)
      .where(eq(schema.agentRunJobs.id, id))
      .get();
    expect(job?.status).toBe("succeeded");
  });

  it("respects per-agent maxConcurrentRuns", async () => {
    // agent.maxConcurrentRuns defaults to 1 in createAgentService
    insertJob(ctx.db, ctx.agent.id, { id: "arj_a" });
    insertJob(ctx.db, ctx.agent.id, { id: "arj_b" });
    await runOrchestratorTick({
      db: ctx.db,
      logger: ctx.logger,
      runnerId: "test-runner",
      config: DEFAULT_ORCHESTRATOR_CONFIG,
      agentService: ctx.svc,
      buildConnector: () => mockConnector(),
      buildWriter: (logger) => mockWriter(logger),
    });
    const jobs = ctx.db.select().from(schema.agentRunJobs).all();
    const succeeded = jobs.filter((j) => j.status === "succeeded").length;
    const queued = jobs.filter((j) => j.status === "queued").length;
    expect(succeeded).toBe(1);
    expect(queued).toBe(1);
  });
});
