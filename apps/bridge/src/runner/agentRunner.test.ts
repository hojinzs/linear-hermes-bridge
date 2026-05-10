import { randomBytes } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { asc, eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import { createDb, schema } from "../db/client.js";
import { mockConnector } from "../hermes/mockConnector.js";
import { mockWriter } from "../linear/mockWriter.js";
import { createLogger } from "../logger.js";
import { createAgentService } from "../services/agents.js";
import { runAttempt } from "./agentRunner.js";

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), "..", "db", "migrations");

async function setup() {
  const dir = mkdtempSync(join(tmpdir(), "lhb-run-"));
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
    permissionPolicy: { defaultMode: "plan-only" },
  });
  const now = new Date().toISOString();
  const jobId = "arj_test_1";
  db.insert(schema.agentRunJobs)
    .values({
      id: jobId,
      agentId: agent.id,
      agentSessionId: null,
      webhookDeliveryId: null,
      dedupeKey: "linear:agt:dev-1",
      triggerType: "agent_session_prompted",
      status: "claimed",
      priority: 0,
      scheduledAt: now,
      claimedBy: "runner-test",
      claimedAt: now,
      cancelRequestedAt: null,
      attemptCount: 1,
      input: {
        agentId: agent.id,
        trigger: {
          type: "agent_session_prompted",
          linearOrganizationId: "org_dev",
          linearAgentSessionId: "sess",
          linearIssueId: "iss1",
          issue: { identifier: "ENG-1", title: "t", url: "https://linear.app/x/ENG-1" },
          userInstruction: "summarize",
        },
      },
      output: null,
      error: null,
      maxAttempts: 3,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  const logger = createLogger({ level: "fatal" });
  return { db, svc, agentId: agent.id, jobId, logger };
}

describe("runAttempt", () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    ctx = await setup();
  });

  it("creates a run_attempts row, emits lifecycle events, and finalizes succeeded", async () => {
    const outcome = await runAttempt({
      db: ctx.db,
      logger: ctx.logger,
      runnerId: "runner-test",
      agentRunJobId: ctx.jobId,
      connector: mockConnector(),
      writer: mockWriter(ctx.logger),
      agentDisplayName: "Mock",
    });
    expect(outcome.status).toBe("succeeded");
    const attempts = ctx.db
      .select()
      .from(schema.runAttempts)
      .where(eq(schema.runAttempts.agentRunJobId, ctx.jobId))
      .all();
    expect(attempts.length).toBe(1);
    expect(attempts[0]?.status).toBe("succeeded");
    const events = ctx.db
      .select()
      .from(schema.runnerEvents)
      .where(eq(schema.runnerEvents.agentRunJobId, ctx.jobId))
      .orderBy(asc(schema.runnerEvents.sequence))
      .all();
    const types = events.map((e) => e.eventType);
    expect(types).toContain("claimed");
    expect(types).toContain("context_loaded");
    expect(types).toContain("prompt_built");
    expect(types).toContain("hermes_started");
    expect(types).toContain("linear_response_posted");
    expect(types).toContain("completed");
  });
});
