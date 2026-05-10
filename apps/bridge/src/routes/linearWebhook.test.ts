import { createHmac, randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { Hono } from "hono";
import { beforeEach, describe, expect, it } from "vitest";
import { encrypt } from "../crypto/encryption.js";
import { createDb, schema } from "../db/client.js";
import { createAgentService } from "../services/agents.js";
import { newId } from "../services/ids.js";
import { linearWebhookRoutes } from "./linearWebhook.js";

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), "..", "db", "migrations");
const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "fixtures");

async function makeApp() {
  const dir = mkdtempSync(join(tmpdir(), "lhb-wh-"));
  const { db } = createDb(`file:${join(dir, "t.db")}`);
  migrate(db, { migrationsFolder });
  const encryptionKey = randomBytes(32);
  const svc = createAgentService({ db, encryptionKey });
  const agent = await svc.create({
    slug: "mock-agent",
    displayName: "Mock",
    description: null,
    iconUrl: null,
    linearClientId: "c",
    linearClientSecret: "cs",
    linearWebhookSecret: "wsecret",
    requiredScopes: ["read"],
    hermesConnectorType: "mock",
    hermesConnectorConfig: { kind: "mock" },
    permissionPolicy: {},
  });
  const app = new Hono();
  app.route("/webhooks/linear", linearWebhookRoutes({ db, agentService: svc }));
  return { app, db, encryptionKey, agent };
}

function sign(body: string, secret: string) {
  return createHmac("sha256", secret).update(body).digest("hex");
}

describe("linear webhook route", () => {
  let ctx: Awaited<ReturnType<typeof makeApp>>;
  beforeEach(async () => {
    ctx = await makeApp();
  });

  it("accepts a valid signed prompted payload and creates a job", async () => {
    const body = readFileSync(join(fixtureDir, "agent-session-prompted.json"), "utf8");
    const res = await ctx.app.request("/webhooks/linear/mock-agent", {
      method: "POST",
      headers: { "linear-signature": sign(body, "wsecret"), "content-type": "application/json" },
      body,
    });
    expect(res.status).toBe(202);
    const data = (await res.json()) as { agentRunJobId: string; status: string };
    expect(data.status).toBe("accepted");
    expect(data.agentRunJobId).toMatch(/^arj_/);
  });

  it("rejects invalid signature", async () => {
    const body = readFileSync(join(fixtureDir, "agent-session-prompted.json"), "utf8");
    const res = await ctx.app.request("/webhooks/linear/mock-agent", {
      method: "POST",
      headers: { "linear-signature": "0".repeat(64), "content-type": "application/json" },
      body,
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 for unknown agent", async () => {
    const body = "{}";
    const res = await ctx.app.request("/webhooks/linear/no-such", {
      method: "POST",
      headers: { "linear-signature": sign(body, "wsecret"), "content-type": "application/json" },
      body,
    });
    expect(res.status).toBe(404);
  });

  it("is idempotent on duplicate delivery", async () => {
    const body = readFileSync(join(fixtureDir, "agent-session-prompted.json"), "utf8");
    const a = await ctx.app.request("/webhooks/linear/mock-agent", {
      method: "POST",
      headers: { "linear-signature": sign(body, "wsecret"), "content-type": "application/json" },
      body,
    });
    const b = await ctx.app.request("/webhooks/linear/mock-agent", {
      method: "POST",
      headers: { "linear-signature": sign(body, "wsecret"), "content-type": "application/json" },
      body,
    });
    const ja = (await a.json()) as { agentRunJobId: string };
    const jb = (await b.json()) as { agentRunJobId: string; status: string };
    expect(jb.status).toBe("duplicate");
    expect(jb.agentRunJobId).toBe(ja.agentRunJobId);
  });

  it("returns ignored for unsupported payloads", async () => {
    const body = JSON.stringify({ type: "Unknown", action: "x", organizationId: "o" });
    const res = await ctx.app.request("/webhooks/linear/mock-agent", {
      method: "POST",
      headers: { "linear-signature": sign(body, "wsecret"), "content-type": "application/json" },
      body,
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { status: string };
    expect(data.status).toBe("ignored");
  });

  function seedInstallation(orgId: string, status = "installed") {
    const id = newId("inst");
    const now = new Date().toISOString();
    ctx.db
      .insert(schema.linearInstallations)
      .values({
        id,
        agentId: ctx.agent.id,
        linearOrganizationId: orgId,
        linearOrganizationName: null,
        accessTokenEnc: encrypt("a", ctx.encryptionKey),
        refreshTokenEnc: null,
        tokenExpiresAt: null,
        scopes: ["read"],
        status,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  it("marks installation revoked on top-level OAuthAppRevoked event", async () => {
    const orgId = "org_revoke1";
    const instId = seedInstallation(orgId);
    const body = JSON.stringify({ type: "OAuthAppRevoked", organizationId: orgId });
    const res = await ctx.app.request("/webhooks/linear/mock-agent", {
      method: "POST",
      headers: { "linear-signature": sign(body, "wsecret"), "content-type": "application/json" },
      body,
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { status: string };
    expect(data.status).toBe("revoked");
    const row = ctx.db
      .select()
      .from(schema.linearInstallations)
      .where(eq(schema.linearInstallations.id, instId))
      .get();
    if (!row) throw new Error("installation row missing");
    expect(row.status).toBe("revoked");
  });

  it("marks installation revoked on AppUserNotification action=oauthAppRevoked", async () => {
    const orgId = "org_revoke2";
    const instId = seedInstallation(orgId);
    const body = JSON.stringify({
      type: "AppUserNotification",
      action: "oauthAppRevoked",
      organizationId: orgId,
    });
    const res = await ctx.app.request("/webhooks/linear/mock-agent", {
      method: "POST",
      headers: { "linear-signature": sign(body, "wsecret"), "content-type": "application/json" },
      body,
    });
    expect(res.status).toBe(200);
    const row = ctx.db
      .select()
      .from(schema.linearInstallations)
      .where(eq(schema.linearInstallations.id, instId))
      .get();
    if (!row) throw new Error("installation row missing");
    expect(row.status).toBe("revoked");
  });

  it("rejects revocation event with invalid signature", async () => {
    const orgId = "org_revoke3";
    seedInstallation(orgId);
    const body = JSON.stringify({ type: "OAuthAppRevoked", organizationId: orgId });
    const res = await ctx.app.request("/webhooks/linear/mock-agent", {
      method: "POST",
      headers: { "linear-signature": "0".repeat(64), "content-type": "application/json" },
      body,
    });
    expect(res.status).toBe(401);
  });

  it("returns 200 for revocation when no matching installation exists", async () => {
    const body = JSON.stringify({ type: "OAuthAppRevoked", organizationId: "org_nomatch" });
    const res = await ctx.app.request("/webhooks/linear/mock-agent", {
      method: "POST",
      headers: { "linear-signature": sign(body, "wsecret"), "content-type": "application/json" },
      body,
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { status: string };
    expect(data.status).toBe("revoked");
  });
});
