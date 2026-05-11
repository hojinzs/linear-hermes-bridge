import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { loadConfig } from "./config.js";
import { createDb } from "./db/client.js";
import { selectConnector } from "./hermes/selectConnector.js";
import { selectWriter } from "./linear/selectWriter.js";
import { createLogger } from "./logger.js";
import { startOrchestrator } from "./orchestrator/claimLoop.js";
import { DEFAULT_ORCHESTRATOR_CONFIG } from "./orchestrator/types.js";
import { createServer } from "./server.js";
import { createAgentService } from "./services/agents.js";

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), "db", "migrations");

const config = loadConfig();
const logger = createLogger({ level: config.logLevel });
const { db } = createDb(config.databaseUrl);
migrate(db, { migrationsFolder });
const agentService = createAgentService({ db, encryptionKey: config.encryptionKey });
const app = createServer({ config, db, logger, agentService });

const stopOrchestrator = new AbortController();
void startOrchestrator({
  db,
  logger,
  runnerId: `runner-${process.pid}`,
  config: DEFAULT_ORCHESTRATOR_CONFIG,
  agentService,
  workspaceRoot: config.workspaceRoot,
  buildConnector: (a) =>
    selectConnector({
      agentSlug: "active",
      hermesConnectorType: a.hermesConnectorType,
      hermesConnectorConfig: a.hermesConnectorConfig,
    }),
  buildWriter: ({ logger: l, agentId }) =>
    selectWriter({
      db,
      logger: l,
      agentId,
      encryptionKey: config.encryptionKey,
      linearLive: config.linearLive,
      agentService,
    }),
  stopSignal: stopOrchestrator.signal,
});

serve({ fetch: app.fetch, port: config.port, hostname: config.host }, (info) => {
  logger.info({ tag: "startup", port: info.port, host: config.host }, "bridge listening");
});

process.on("SIGINT", () => {
  stopOrchestrator.abort();
  process.exit(0);
});
process.on("SIGTERM", () => {
  stopOrchestrator.abort();
  process.exit(0);
});
