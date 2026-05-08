import { randomBytes } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../db/client.js";
import { createAgentService } from "./agents.js";

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), "..", "db", "migrations");

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "lhb-svc-"));
  const { db, close } = createDb(`file:${join(dir, "t.db")}`);
  migrate(db, { migrationsFolder });
  const key = randomBytes(32);
  const svc = createAgentService({ db, encryptionKey: key });
  return { svc, close };
}

describe("agentService", () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  it("creates and retrieves an agent (secrets are encrypted at rest, decrypted on read)", async () => {
    const created = await ctx.svc.create({
      slug: "pm-agent",
      displayName: "PM Agent",
      description: null,
      iconUrl: null,
      linearClientId: "client123",
      linearClientSecret: "secret-client",
      linearWebhookSecret: "secret-webhook",
      requiredScopes: ["read", "comments:create"],
      hermesConnectorType: "mock",
      hermesConnectorConfig: { kind: "mock" },
      permissionPolicy: { defaultMode: "plan-only" },
    });
    expect(created.slug).toBe("pm-agent");
    const fetched = await ctx.svc.getBySlugWithSecrets("pm-agent");
    expect(fetched?.linearClientSecret).toBe("secret-client");
    expect(fetched?.linearWebhookSecret).toBe("secret-webhook");
  });

  it("rejects duplicate slug", async () => {
    const base = {
      displayName: "x",
      description: null,
      iconUrl: null,
      linearClientId: "c",
      linearClientSecret: "s1",
      linearWebhookSecret: "s2",
      requiredScopes: ["read"],
      hermesConnectorType: "mock" as const,
      hermesConnectorConfig: { kind: "mock" },
      permissionPolicy: {},
    };
    await ctx.svc.create({ slug: "dup", ...base });
    await expect(ctx.svc.create({ slug: "dup", ...base })).rejects.toThrow(/slug/);
  });

  it("listSummaries omits secrets", async () => {
    await ctx.svc.create({
      slug: "a",
      displayName: "A",
      description: null,
      iconUrl: null,
      linearClientId: "c",
      linearClientSecret: "s1",
      linearWebhookSecret: "s2",
      requiredScopes: ["read"],
      hermesConnectorType: "mock",
      hermesConnectorConfig: { kind: "mock" },
      permissionPolicy: {},
    });
    const list = await ctx.svc.listSummaries();
    expect(list[0]).toBeDefined();
    const a = list[0]!;
    expect(a.slug).toBe("a");
    expect((a as Record<string, unknown>).linearClientSecret).toBeUndefined();
  });

  it("disable/enable flips the enabled flag", async () => {
    await ctx.svc.create({
      slug: "x",
      displayName: "X",
      description: null,
      iconUrl: null,
      linearClientId: "c",
      linearClientSecret: "s1",
      linearWebhookSecret: "s2",
      requiredScopes: ["read"],
      hermesConnectorType: "mock",
      hermesConnectorConfig: { kind: "mock" },
      permissionPolicy: {},
    });
    await ctx.svc.setEnabled("x", false);
    expect((await ctx.svc.getBySlug("x"))?.enabled).toBe(false);
    await ctx.svc.setEnabled("x", true);
    expect((await ctx.svc.getBySlug("x"))?.enabled).toBe(true);
  });
});
