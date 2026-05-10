import { randomBytes } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { Hono } from "hono";
import { beforeEach, describe, expect, it } from "vitest";
import { createDb, schema } from "../db/client.js";
import { createAgentService } from "../services/agents.js";
import { runJobsRoutes } from "./runJobs.js";

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), "..", "db", "migrations");

async function makeApp() {
  const dir = mkdtempSync(join(tmpdir(), "lhb-rj-"));
  const { db } = createDb(`file:${join(dir, "t.db")}`);
  migrate(db, { migrationsFolder });
  const svc = createAgentService({ db, encryptionKey: randomBytes(32) });
  const a = await svc.create({
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
  const now = new Date().toISOString();
  db.insert(schema.agentRunJobs)
    .values({
      id: "arj_a",
      agentId: a.id,
      agentSessionId: null,
      webhookDeliveryId: null,
      dedupeKey: "k1",
      triggerType: "mention",
      status: "queued",
      priority: 0,
      scheduledAt: now,
      claimedBy: null,
      claimedAt: null,
      cancelRequestedAt: null,
      attemptCount: 0,
      input: { trigger: { type: "mention" } },
      output: null,
      error: null,
      maxAttempts: 3,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  const app = new Hono();
  app.route("/api/agent-run-jobs", runJobsRoutes({ db }));
  return { app, jobId: "arj_a" };
}

describe("run-jobs routes", () => {
  let ctx: Awaited<ReturnType<typeof makeApp>>;
  beforeEach(async () => {
    ctx = await makeApp();
  });

  it("lists jobs", async () => {
    const res = await ctx.app.request("/api/agent-run-jobs");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { jobs: { id: string }[] };
    expect(body.jobs.length).toBeGreaterThan(0);
  });

  it("gets a single job with events", async () => {
    const res = await ctx.app.request(`/api/agent-run-jobs/${ctx.jobId}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { job: { id: string }; events: unknown[] };
    expect(body.job.id).toBe(ctx.jobId);
    expect(Array.isArray(body.events)).toBe(true);
  });

  it("returns 404 for unknown job", async () => {
    const res = await ctx.app.request("/api/agent-run-jobs/nope");
    expect(res.status).toBe(404);
  });

  it("cancels a queued job", async () => {
    const res = await ctx.app.request(`/api/agent-run-jobs/${ctx.jobId}/cancel`, {
      method: "POST",
    });
    expect(res.status).toBe(202);
    const body = (await res.json()) as { ok: boolean; cancelRequestedAt: string };
    expect(body.ok).toBe(true);
    expect(body.cancelRequestedAt).toBeDefined();
  });
});
