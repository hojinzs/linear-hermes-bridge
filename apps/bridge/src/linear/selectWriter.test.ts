import { randomBytes } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { describe, expect, it } from "vitest";
import { encrypt } from "../crypto/encryption.js";
import { createDb, schema } from "../db/client.js";
import { createLogger } from "../logger.js";
import { createAgentService } from "../services/agents.js";
import { WriterMissingTokenError, selectWriter } from "./selectWriter.js";

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), "..", "db", "migrations");

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "lhb-sw-"));
  const { db } = createDb(`file:${join(dir, "t.db")}`);
  migrate(db, { migrationsFolder });
  return { db, key: randomBytes(32), logger: createLogger({ level: "fatal" }) };
}

describe("selectWriter", () => {
  it("returns mockWriter when linearLive=false", async () => {
    const { db, key, logger } = setup();
    const w = selectWriter({
      db,
      logger,
      agentId: "agt_1",
      encryptionKey: key,
      linearLive: false,
    });
    const r = await w.postComment({
      agentRunJobId: "arj",
      runAttemptId: "ra",
      organizationId: "org_1",
      issueId: "issue_1",
      body: "hello",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error();
    expect(r.commentId).toMatch(/^mock_cmt_/);
  });

  it("throws via PostCommentResult when live and no installation row exists", async () => {
    const { db, key, logger } = setup();
    const w = selectWriter({
      db,
      logger,
      agentId: "agt_missing",
      encryptionKey: key,
      linearLive: true,
    });
    const r = await w.postComment({
      agentRunJobId: "arj",
      runAttemptId: "ra",
      organizationId: "org_missing",
      issueId: "issue_1",
      body: "hello",
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error();
    expect(r.error).toMatch(/no linear installation/);
  });

  it("WriterMissingTokenError class is exported", () => {
    const e = new WriterMissingTokenError("x");
    expect(e.name).toBe("WriterMissingTokenError");
    expect(e).toBeInstanceOf(Error);
  });

  it("getAccessToken pulls and decrypts when installation exists (live writer is invoked)", async () => {
    const { db, key, logger } = setup();
    const now = new Date().toISOString();
    db.insert(schema.linearInstallations)
      .values({
        id: "inst_1",
        agentId: "agt_live",
        linearOrganizationId: "org_live",
        linearOrganizationName: "Live",
        accessTokenEnc: encrypt("super-secret-token", key),
        refreshTokenEnc: null,
        tokenExpiresAt: null,
        scopes: ["read", "comments:create"],
        status: "installed",
        createdAt: now,
        updatedAt: now,
      })
      .run();

    let capturedAuth: string | undefined;
    const fetchImpl = (async (_url: unknown, init?: RequestInit) => {
      capturedAuth = ((init?.headers ?? {}) as Record<string, string>).authorization;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: { commentCreate: { success: true, comment: { id: "cmt_x", url: "https://u" } } },
        }),
        text: async () => "",
      } as unknown as Response;
    }) as typeof fetch;
    const w = selectWriter({
      db,
      logger,
      agentId: "agt_live",
      encryptionKey: key,
      linearLive: true,
      fetchImpl,
    });
    const r = await w.postComment({
      agentRunJobId: "arj",
      runAttemptId: "ra",
      organizationId: "org_live",
      issueId: "issue_1",
      body: "hello",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error();
    expect(r.commentId).toBe("cmt_x");
    expect(capturedAuth).toBe("Bearer super-secret-token");
  });

  it("refreshes expired token before invoking writer when agentService is provided", async () => {
    const { db, key, logger } = setup();
    const agentService = createAgentService({ db, encryptionKey: key });
    const agent = await agentService.create({
      slug: "live",
      displayName: "Live",
      description: null,
      iconUrl: null,
      linearClientId: "client-id",
      linearClientSecret: "client-secret",
      linearWebhookSecret: "w",
      requiredScopes: ["read"],
      hermesConnectorType: "mock",
      hermesConnectorConfig: { kind: "mock" },
      permissionPolicy: {},
    });

    const now = new Date().toISOString();
    db.insert(schema.linearInstallations)
      .values({
        id: "inst_refresh",
        agentId: agent.id,
        linearOrganizationId: "org_live",
        linearOrganizationName: "Live",
        accessTokenEnc: encrypt("old-token", key),
        refreshTokenEnc: encrypt("old-refresh", key),
        tokenExpiresAt: new Date(Date.now() - 60_000).toISOString(),
        scopes: ["read", "comments:create"],
        status: "installed",
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const calls: { url: string; auth?: string }[] = [];
    const fetchImpl = (async (url: unknown, init?: RequestInit) => {
      const u = String(url);
      const headers = (init?.headers ?? {}) as Record<string, string>;
      calls.push({ url: u, auth: headers.authorization });
      if (u.includes("/oauth/token")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            access_token: "fresh-token",
            refresh_token: "fresh-refresh",
            token_type: "Bearer",
            expires_in: 3600,
          }),
          text: async () => "",
        } as unknown as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: { commentCreate: { success: true, comment: { id: "cmt_x", url: "https://u" } } },
        }),
        text: async () => "",
      } as unknown as Response;
    }) as typeof fetch;

    const w = selectWriter({
      db,
      logger,
      agentId: agent.id,
      encryptionKey: key,
      linearLive: true,
      fetchImpl,
      agentService,
    });
    const r = await w.postComment({
      agentRunJobId: "arj",
      runAttemptId: "ra",
      organizationId: "org_live",
      issueId: "issue_1",
      body: "hello",
    });
    expect(r.ok).toBe(true);

    const tokenCall = calls.find((c) => c.url.includes("/oauth/token"));
    const graphqlCall = calls.find((c) => !c.url.includes("/oauth/token"));
    expect(tokenCall).toBeDefined();
    expect(graphqlCall?.auth).toBe("Bearer fresh-token");

    const row = db
      .select()
      .from(schema.linearInstallations)
      .where(eq(schema.linearInstallations.id, "inst_refresh"))
      .get();
    if (!row) throw new Error("installation row missing");
    expect(row.status).toBe("installed");
    expect(row.tokenExpiresAt).not.toBeNull();
  });

  it("surfaces WriterMissingTokenError when refresh fails with 4xx (and DB marked revoked)", async () => {
    const { db, key, logger } = setup();
    const agentService = createAgentService({ db, encryptionKey: key });
    const agent = await agentService.create({
      slug: "rev",
      displayName: "Rev",
      description: null,
      iconUrl: null,
      linearClientId: "client-id",
      linearClientSecret: "client-secret",
      linearWebhookSecret: "w",
      requiredScopes: ["read"],
      hermesConnectorType: "mock",
      hermesConnectorConfig: { kind: "mock" },
      permissionPolicy: {},
    });

    const now = new Date().toISOString();
    db.insert(schema.linearInstallations)
      .values({
        id: "inst_rev",
        agentId: agent.id,
        linearOrganizationId: "org_rev",
        linearOrganizationName: "Rev",
        accessTokenEnc: encrypt("old-token", key),
        refreshTokenEnc: encrypt("old-refresh", key),
        tokenExpiresAt: new Date(Date.now() - 60_000).toISOString(),
        scopes: ["read"],
        status: "installed",
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const fetchImpl = (async (url: unknown) => {
      if (String(url).includes("/oauth/token")) {
        return {
          ok: false,
          status: 401,
          json: async () => ({ error: "invalid_grant" }),
          text: async () => '{"error":"invalid_grant"}',
        } as unknown as Response;
      }
      throw new Error("graphql should not be reached when refresh fails");
    }) as typeof fetch;

    const w = selectWriter({
      db,
      logger,
      agentId: agent.id,
      encryptionKey: key,
      linearLive: true,
      fetchImpl,
      agentService,
    });
    const r = await w.postComment({
      agentRunJobId: "arj",
      runAttemptId: "ra",
      organizationId: "org_rev",
      issueId: "issue_1",
      body: "hello",
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error();
    expect(r.error).toMatch(/refresh/i);

    const row = db
      .select()
      .from(schema.linearInstallations)
      .where(eq(schema.linearInstallations.id, "inst_rev"))
      .get();
    if (!row) throw new Error("installation row missing");
    expect(row.status).toBe("revoked");
  });
});
