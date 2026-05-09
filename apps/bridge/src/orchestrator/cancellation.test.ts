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
  const dir = mkdtempSync(join(tmpdir(), "lhb-cancel-"));
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

describe("cancellation", () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    ctx = await setup();
  });

  it("transitions queued + cancel_requested directly to canceled without creating an attempt", async () => {
    const now = new Date().toISOString();
    const id = "arj_cancel_q";
    ctx.db
      .insert(schema.agentRunJobs)
      .values({
        id,
        agentId: ctx.agent.id,
        agentSessionId: null,
        webhookDeliveryId: null,
        dedupeKey: id,
        triggerType: "agent_session_prompted",
        status: "queued",
        priority: 0,
        scheduledAt: now,
        claimedBy: null,
        claimedAt: null,
        cancelRequestedAt: now,
        attemptCount: 0,
        input: { agentId: ctx.agent.id, trigger: { type: "agent_session_prompted" } },
        output: null,
        error: null,
        maxAttempts: 3,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    await runOrchestratorTick({
      db: ctx.db,
      logger: ctx.logger,
      runnerId: "t",
      config: DEFAULT_ORCHESTRATOR_CONFIG,
      agentService: ctx.svc,
      buildConnector: () => mockConnector(),
      buildWriter: ({ logger: l }) => mockWriter(l),
    });

    const job = ctx.db
      .select()
      .from(schema.agentRunJobs)
      .where(eq(schema.agentRunJobs.id, id))
      .get();
    expect(job?.status).toBe("canceled");
    const attempts = ctx.db
      .select()
      .from(schema.runAttempts)
      .where(eq(schema.runAttempts.agentRunJobId, id))
      .all();
    expect(attempts.length).toBe(0);
  });
});
