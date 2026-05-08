import { Hono } from "hono";
import { logger as honoLogger } from "hono/logger";
import type { AppContext } from "./appContext.js";
import { agentRoutes } from "./routes/agents.js";
import { healthRoutes } from "./routes/health.js";
import { linearWebhookRoutes } from "./routes/linearWebhook.js";

export function createServer(ctx: AppContext) {
  const app = new Hono();
  app.use(
    "*",
    honoLogger((msg) => ctx.logger.info({ tag: "http" }, msg)),
  );
  app.route("/", healthRoutes());
  app.route(
    "/api/agents",
    agentRoutes({ agentService: ctx.agentService, publicBaseUrl: ctx.config.publicBaseUrl }),
  );
  app.route(
    "/webhooks/linear",
    linearWebhookRoutes({ db: ctx.db, agentService: ctx.agentService }),
  );
  return app;
}
