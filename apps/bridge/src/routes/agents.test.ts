import { randomBytes } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { Hono } from "hono";
import { beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../db/client.js";
import { createAgentService } from "../services/agents.js";
import { agentRoutes } from "./agents.js";

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), "..", "db", "migrations");

function makeApp(publicBaseUrl: string) {
  const dir = mkdtempSync(join(tmpdir(), "lhb-rt-"));
  const { db } = createDb(`file:${join(dir, "t.db")}`);
  migrate(db, { migrationsFolder });
  const svc = createAgentService({ db, encryptionKey: randomBytes(32) });
  const app = new Hono();
  app.route("/api/agents", agentRoutes({ agentService: svc, publicBaseUrl, db }));
  return app;
}

const valid = {
  slug: "pm-agent",
  displayName: "PM Agent",
  description: null,
  iconUrl: null,
  linearClientId: "client",
  linearClientSecret: "s-c",
  linearWebhookSecret: "s-w",
  requiredScopes: ["read"],
  hermesConnectorType: "mock",
  hermesConnectorConfig: { kind: "mock" },
  permissionPolicy: { defaultMode: "plan-only" },
};

describe("agents routes", () => {
  let app: ReturnType<typeof makeApp>;
  beforeEach(() => {
    app = makeApp("https://example.test");
  });

  it("POST /api/agents creates an agent and returns generated URLs", async () => {
    const res = await app.request("/api/agents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(valid),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as Record<string, unknown>;
    const agent = body.agent as Record<string, string>;
    expect(agent.slug).toBe("pm-agent");
    expect(agent.callbackUrl).toBe("https://example.test/oauth/callback/pm-agent");
    expect(agent.webhookUrl).toBe("https://example.test/webhooks/linear/pm-agent");
    expect(agent.installUrl).toBe("https://example.test/oauth/authorize/pm-agent");
  });

  it("GET /api/agents lists agents", async () => {
    await app.request("/api/agents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(valid),
    });
    const res = await app.request("/api/agents");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { agents: unknown[] };
    expect(body.agents.length).toBe(1);
  });

  it("GET /api/agents/:slug returns 404 for unknown", async () => {
    const res = await app.request("/api/agents/nope");
    expect(res.status).toBe(404);
  });

  it("POST /api/agents/:slug/disable flips enabled", async () => {
    await app.request("/api/agents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(valid),
    });
    const res = await app.request("/api/agents/pm-agent/disable", { method: "POST" });
    expect(res.status).toBe(200);
    const detail = await app.request("/api/agents/pm-agent");
    const body = (await detail.json()) as { agent: { enabled: boolean } };
    expect(body.agent.enabled).toBe(false);
  });

  it("rejects invalid body", async () => {
    const res = await app.request("/api/agents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug: "" }),
    });
    expect(res.status).toBe(400);
  });
});
