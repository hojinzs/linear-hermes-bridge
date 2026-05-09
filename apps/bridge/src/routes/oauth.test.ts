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

type FetchScript = (
  url: string,
  init?: RequestInit,
) => Promise<{
  status: number;
  body: unknown;
}>;

function scriptedFetch(handler: FetchScript): typeof fetch {
  return (async (url: unknown, init?: RequestInit) => {
    const r = await handler(String(url), init);
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      json: async () => r.body,
      text: async () => JSON.stringify(r.body),
    } as unknown as Response;
  }) as typeof fetch;
}

async function makeApp(opts?: { linearLive?: boolean; fetchImpl?: typeof fetch }) {
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
      linearLive: opts?.linearLive ?? false,
      encryptionKey: key,
      ...(opts?.fetchImpl && { fetchImpl: opts.fetchImpl }),
    }),
  );
  return { app, db, key };
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
    const live = await makeApp({ linearLive: true });
    const res = await live.app.request("/oauth/dev/install/mock", { method: "POST" });
    expect(res.status).toBe(403);
  });

  it("live callback exchanges code, queries viewer, and creates installation", async () => {
    const fetchImpl = scriptedFetch(async (url) => {
      if (url.includes("/oauth/token")) {
        return {
          status: 200,
          body: {
            access_token: "live-tok",
            refresh_token: "live-ref",
            token_type: "Bearer",
            expires_in: 3600,
            scope: "read,comments:create",
          },
        };
      }
      if (url.includes("/graphql")) {
        return {
          status: 200,
          body: {
            data: {
              viewer: {
                id: "user_1",
                name: "Steve",
                organization: { id: "org_real", name: "Real Org", urlKey: "real" },
              },
            },
          },
        };
      }
      return { status: 404, body: {} };
    });
    const live = await makeApp({ linearLive: true, fetchImpl });
    // First seed an oauth state row by hitting authorize
    const auth = await live.app.request("/oauth/authorize/mock", { redirect: "manual" });
    const location = auth.headers.get("location") ?? "";
    const state = new URL(location).searchParams.get("state") ?? "";

    const cb = await live.app.request(`/oauth/callback/mock?state=${state}&code=abc`);
    expect(cb.status).toBe(200);
    const body = (await cb.json()) as { organizationId: string; installationId: string };
    expect(body.organizationId).toBe("org_real");
    expect(body.installationId).toMatch(/^inst_/);

    const rows = live.db.select().from(schema.linearInstallations).all();
    expect(rows.length).toBe(1);
    expect(rows[0]?.linearOrganizationId).toBe("org_real");
    expect(rows[0]?.linearOrganizationName).toBe("Real Org");
    expect(rows[0]?.scopes).toEqual(["read", "comments:create"]);
  });

  it("live callback with invalid state returns 400", async () => {
    const live = await makeApp({ linearLive: true });
    const res = await live.app.request("/oauth/callback/mock?state=nope&code=abc");
    expect(res.status).toBe(400);
  });

  it("live callback updates existing installation for same org", async () => {
    let tokenCalls = 0;
    const fetchImpl = scriptedFetch(async (url) => {
      if (url.includes("/oauth/token")) {
        tokenCalls += 1;
        return {
          status: 200,
          body: {
            access_token: `live-tok-${tokenCalls}`,
            token_type: "Bearer",
            expires_in: 3600,
            scope: "read",
          },
        };
      }
      return {
        status: 200,
        body: {
          data: {
            viewer: {
              id: "user_1",
              name: "Steve",
              organization: { id: "org_same", name: "Same Org", urlKey: "same" },
            },
          },
        },
      };
    });
    const live = await makeApp({ linearLive: true, fetchImpl });

    async function flow() {
      const auth = await live.app.request("/oauth/authorize/mock", { redirect: "manual" });
      const state = new URL(auth.headers.get("location") ?? "").searchParams.get("state") ?? "";
      const cb = await live.app.request(`/oauth/callback/mock?state=${state}&code=c`);
      return (await cb.json()) as { status: string; installationId: string };
    }
    const r1 = await flow();
    expect(r1.status).toBe("installed");
    const r2 = await flow();
    expect(r2.status).toBe("updated");
    expect(r2.installationId).toBe(r1.installationId);
    expect(live.db.select().from(schema.linearInstallations).all().length).toBe(1);
  });
});
