import { randomBytes } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { beforeAll, describe, expect, it } from "vitest";
import type { AppContext } from "./appContext.js";
import { createDb } from "./db/client.js";
import { createLogger } from "./logger.js";
import { createServer } from "./server.js";
import { createAgentService } from "./services/agents.js";

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), "db", "migrations");

describe("createServer", () => {
  let ctx: AppContext;

  beforeAll(() => {
    const { db } = createDb("file::memory:?cache=shared");
    migrate(db, { migrationsFolder });
    const encryptionKey = randomBytes(32);
    const config = {
      publicBaseUrl: "http://localhost",
      port: 8787,
      databaseUrl: ":memory:",
      encryptionKey,
      appSecret: "x".repeat(32),
      linearLive: false,
      logLevel: "fatal" as const,
    };
    const logger = createLogger({ level: "fatal" });
    const agentService = createAgentService({ db, encryptionKey });
    ctx = { config, db, logger, agentService };
  });

  it("returns health status", async () => {
    const app = createServer(ctx);

    const response = await app.request("/healthz");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      service: "linear-hermes-bridge",
      version: "0.0.0",
    });
  });
});
