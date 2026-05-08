import { randomBytes } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { Hono } from "hono";
import { beforeEach, describe, expect, it } from "vitest";
import { createDb, schema } from "../db/client.js";
import { createAgentService } from "../services/agents.js";
import { oauthRoutes } from "./oauth.js";

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), "..", "db", "migrations");

async function makeApp(linearLive = false) {
  const dir = mkdtempSync(join(tmpdir(), "lhb-oauth-"));
  const { db } = createDb(`file:${join(dir, "t.db")}`);
  migrate(db, { migrationsFolder });
  const key = randomBytes(32);
  const svc = createAgentService({ db, encryptionKey: key });
  await svc.create({
    slug: "mock",
    displayName: "Mock",
    description: null,
    iconUrl: null,
    linearClientId: "client_xyz",
    linearClientSecret: "cs",
    linearWebhookSecret: "ws",
    requiredScopes: ["read", "comments:create"],
    hermesConnectorType: "mock",
    hermesConnectorConfig: { kind: "mock" },
    permissionPolicy: {},
  });
  const app = new Hono();
  app.route(
    "/oauth",
    oauthRoutes({
      db,
      agentService: svc,
      publicBaseUrl: "https://example.test",
      linearLive,
      encryptionKey: key,
    }),
  );
  return { app, db };
}

describe("oauth routes", () => {
  let ctx: Awaited<ReturnType<typeof makeApp>>;
  beforeEach(async () => {
    ctx = await makeApp();
  });

  it("builds authorize URL with required params", async () => {
    const res = await ctx.app.request("/oauth/authorize/mock", { redirect: "manual" });
    expect(res.status).toBe(302);
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("client_id=client_xyz");
    expect(location).toContain("response_type=code");
    expect(location).toContain(
      `redirect_uri=${encodeURIComponent("https://example.test/oauth/callback/mock")}`,
    );
    expect(location).toContain("actor=app");
    expect(location).toMatch(/state=[A-Za-z0-9_-]{16,}/);
  });

  it("dev install creates a linear_installations row when LINEAR_LIVE=false", async () => {
    const res = await ctx.app.request("/oauth/dev/install/mock", { method: "POST" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
    const rows = ctx.db.select().from(schema.linearInstallations).all();
    expect(rows.length).toBe(1);
    expect(rows[0]?.linearOrganizationId).toBe("org_dev");
  });

  it("dev install refuses when LINEAR_LIVE=true", async () => {
    const live = await makeApp(true);
    const res = await live.app.request("/oauth/dev/install/mock", { method: "POST" });
    expect(res.status).toBe(403);
  });
});
