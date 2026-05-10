import { randomBytes } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import { decrypt, encrypt } from "../crypto/encryption.js";
import { createDb, schema } from "../db/client.js";
import { createAgentService } from "./agents.js";
import { newId } from "./ids.js";
import { refreshLinearTokenIfNeeded } from "./tokenRefresh.js";

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), "..", "db", "migrations");

async function setup() {
  const dir = mkdtempSync(join(tmpdir(), "lhb-tref-"));
  const { db } = createDb(`file:${join(dir, "t.db")}`);
  migrate(db, { migrationsFolder });
  const encryptionKey = randomBytes(32);
  const svc = createAgentService({ db, encryptionKey });
  const agent = await svc.create({
    slug: "a",
    displayName: "A",
    description: null,
    iconUrl: null,
    linearClientId: "client",
    linearClientSecret: "secret",
    linearWebhookSecret: "w",
    requiredScopes: ["read"],
    hermesConnectorType: "mock",
    hermesConnectorConfig: { kind: "mock" },
    permissionPolicy: {},
  });
  return { db, encryptionKey, svc, agent };
}

function insertInstallation(opts: {
  db: ReturnType<typeof createDb>["db"];
  encryptionKey: Buffer;
  agentId: string;
  accessToken?: string;
  refreshToken?: string | null;
  tokenExpiresAt?: string | null;
  status?: string;
}) {
  const id = newId("inst");
  const now = new Date().toISOString();
  opts.db
    .insert(schema.linearInstallations)
    .values({
      id,
      agentId: opts.agentId,
      linearOrganizationId: "org_x",
      linearOrganizationName: "Org X",
      accessTokenEnc: encrypt(opts.accessToken ?? "old-access", opts.encryptionKey),
      refreshTokenEnc:
        opts.refreshToken === null
          ? null
          : opts.refreshToken !== undefined
            ? encrypt(opts.refreshToken, opts.encryptionKey)
            : encrypt("old-refresh", opts.encryptionKey),
      tokenExpiresAt: opts.tokenExpiresAt ?? null,
      scopes: ["read"],
      status: opts.status ?? "installed",
      createdAt: now,
      updatedAt: now,
    })
    .run();
  const row = opts.db
    .select()
    .from(schema.linearInstallations)
    .where(eq(schema.linearInstallations.id, id))
    .get();
  if (!row) throw new Error("seeded installation not found");
  return row;
}

function fakeTokenFetch(status: number, body: unknown): typeof fetch {
  return (async () =>
    ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    }) as unknown as Response) as typeof fetch;
}

function expectRow<T>(row: T | undefined): T {
  if (row === undefined) throw new Error("expected row but got undefined");
  return row;
}

function expectString(v: string | null | undefined): string {
  if (typeof v !== "string") throw new Error("expected string but got non-string");
  return v;
}

describe("refreshLinearTokenIfNeeded", () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    ctx = await setup();
  });

  it("returns refreshed=false when installation has no refresh token", async () => {
    const inst = insertInstallation({
      db: ctx.db,
      encryptionKey: ctx.encryptionKey,
      agentId: ctx.agent.id,
      refreshToken: null,
      tokenExpiresAt: new Date(Date.now() - 60_000).toISOString(),
    });
    const fetchImpl = fakeTokenFetch(200, { access_token: "should-not-be-called" });
    const result = await refreshLinearTokenIfNeeded({
      db: ctx.db,
      installation: inst,
      clientId: "client",
      clientSecret: "secret",
      encryptionKey: ctx.encryptionKey,
      fetchImpl,
    });
    expect(result.refreshed).toBe(false);
  });

  it("returns refreshed=false when token has no expiry recorded", async () => {
    const inst = insertInstallation({
      db: ctx.db,
      encryptionKey: ctx.encryptionKey,
      agentId: ctx.agent.id,
      tokenExpiresAt: null,
    });
    const result = await refreshLinearTokenIfNeeded({
      db: ctx.db,
      installation: inst,
      clientId: "client",
      clientSecret: "secret",
      encryptionKey: ctx.encryptionKey,
      fetchImpl: fakeTokenFetch(200, { access_token: "x" }),
    });
    expect(result.refreshed).toBe(false);
  });

  it("returns refreshed=false when token is far from expiry", async () => {
    const inst = insertInstallation({
      db: ctx.db,
      encryptionKey: ctx.encryptionKey,
      agentId: ctx.agent.id,
      tokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });
    const result = await refreshLinearTokenIfNeeded({
      db: ctx.db,
      installation: inst,
      clientId: "client",
      clientSecret: "secret",
      encryptionKey: ctx.encryptionKey,
      fetchImpl: fakeTokenFetch(200, { access_token: "x" }),
    });
    expect(result.refreshed).toBe(false);
  });

  it("refreshes and writes new encrypted access_token, refresh_token, and expiry to DB", async () => {
    const inst = insertInstallation({
      db: ctx.db,
      encryptionKey: ctx.encryptionKey,
      agentId: ctx.agent.id,
      accessToken: "old-access",
      refreshToken: "old-refresh",
      tokenExpiresAt: new Date(Date.now() - 60_000).toISOString(),
    });
    const fetchImpl = fakeTokenFetch(200, {
      access_token: "new-access",
      refresh_token: "new-refresh",
      token_type: "Bearer",
      expires_in: 3600,
    });
    const result = await refreshLinearTokenIfNeeded({
      db: ctx.db,
      installation: inst,
      clientId: "client",
      clientSecret: "secret",
      encryptionKey: ctx.encryptionKey,
      fetchImpl,
    });
    expect(result.refreshed).toBe(true);
    expect(result.accessToken).toBe("new-access");

    const row = expectRow(
      ctx.db
        .select()
        .from(schema.linearInstallations)
        .where(eq(schema.linearInstallations.id, inst.id))
        .get(),
    );
    expect(decrypt(row.accessTokenEnc, ctx.encryptionKey)).toBe("new-access");
    expect(decrypt(expectString(row.refreshTokenEnc), ctx.encryptionKey)).toBe("new-refresh");
    expect(new Date(expectString(row.tokenExpiresAt)).getTime()).toBeGreaterThan(
      Date.now() + 60_000,
    );
    expect(row.status).toBe("installed");
  });

  it("preserves old refresh token when token endpoint omits a new one", async () => {
    const inst = insertInstallation({
      db: ctx.db,
      encryptionKey: ctx.encryptionKey,
      agentId: ctx.agent.id,
      refreshToken: "keep-refresh",
      tokenExpiresAt: new Date(Date.now() - 60_000).toISOString(),
    });
    const fetchImpl = fakeTokenFetch(200, {
      access_token: "new-access",
      token_type: "Bearer",
      expires_in: 3600,
    });
    await refreshLinearTokenIfNeeded({
      db: ctx.db,
      installation: inst,
      clientId: "client",
      clientSecret: "secret",
      encryptionKey: ctx.encryptionKey,
      fetchImpl,
    });
    const row = expectRow(
      ctx.db
        .select()
        .from(schema.linearInstallations)
        .where(eq(schema.linearInstallations.id, inst.id))
        .get(),
    );
    expect(decrypt(expectString(row.refreshTokenEnc), ctx.encryptionKey)).toBe("keep-refresh");
  });

  it("marks installation revoked when refresh fails with 4xx", async () => {
    const inst = insertInstallation({
      db: ctx.db,
      encryptionKey: ctx.encryptionKey,
      agentId: ctx.agent.id,
      tokenExpiresAt: new Date(Date.now() - 60_000).toISOString(),
    });
    const fetchImpl = fakeTokenFetch(401, { error: "invalid_grant" });
    await expect(
      refreshLinearTokenIfNeeded({
        db: ctx.db,
        installation: inst,
        clientId: "client",
        clientSecret: "secret",
        encryptionKey: ctx.encryptionKey,
        fetchImpl,
      }),
    ).rejects.toThrow();
    const row = expectRow(
      ctx.db
        .select()
        .from(schema.linearInstallations)
        .where(eq(schema.linearInstallations.id, inst.id))
        .get(),
    );
    expect(row.status).toBe("revoked");
  });
});
