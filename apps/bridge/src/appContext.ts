import type { Config } from "./config.js";
import type { DbClient } from "./db/client.js";
import type { AppLogger } from "./logger.js";
import type { AgentService } from "./services/agents.js";

export type AppContext = {
  config: Config;
  db: DbClient;
  logger: AppLogger;
  agentService: AgentService;
};
