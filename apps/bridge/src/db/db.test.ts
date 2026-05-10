import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { describe, expect, it } from "vitest";
import { createDb, schema } from "./client.js";

const __filename = fileURLToPath(import.meta.url);
const migrationsFolder = join(dirname(__filename), "migrations");

describe("db round-trip", () => {
  it("inserts and selects an agent", () => {
    const dir = mkdtempSync(join(tmpdir(), "lhb-"));
    const url = `file:${join(dir, "test.db")}`;
    const { db, close } = createDb(url);
    try {
      migrate(db, { migrationsFolder });
      const now = new Date().toISOString();
      db.insert(schema.agents)
        .values({
          id: "agt_1",
          slug: "test",
          displayName: "Test",
          description: null,
          iconUrl: null,
          enabled: true,
          linearClientId: "client",
          linearClientSecretEnc: "enc",
          linearWebhookSecretEnc: "enc",
          requiredScopes: ["read"],
          hermesConnectorType: "mock",
          hermesConnectorConfigEnc: "enc",
          permissionPolicy: { defaultMode: "plan-only" },
          maxConcurrentRuns: 1,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      const rows = db.select().from(schema.agents).all();
      expect(rows.length).toBe(1);
      expect(rows[0]?.slug).toBe("test");
      expect(rows[0]?.requiredScopes).toEqual(["read"]);
    } finally {
      close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
