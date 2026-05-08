import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { loadConfig } from "./config.js";
import { createDb } from "./db/client.js";
import { createLogger } from "./logger.js";
import { createServer } from "./server.js";
import { createAgentService } from "./services/agents.js";

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), "db", "migrations");

const config = loadConfig();
const logger = createLogger({ level: config.logLevel });
const { db } = createDb(config.databaseUrl);
migrate(db, { migrationsFolder });
const agentService = createAgentService({ db, encryptionKey: config.encryptionKey });
const app = createServer({ config, db, logger, agentService });

serve({ fetch: app.fetch, port: config.port, hostname: "127.0.0.1" }, (info) => {
  logger.info({ tag: "startup", port: info.port }, "bridge listening");
});
