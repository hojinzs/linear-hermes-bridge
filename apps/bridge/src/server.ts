import { Hono } from "hono";
import { logger as honoLogger } from "hono/logger";
import type { AppContext } from "./appContext.js";
import { agentRoutes } from "./routes/agents.js";
import { healthRoutes } from "./routes/health.js";
import { linearWebhookRoutes } from "./routes/linearWebhook.js";
import { oauthRoutes } from "./routes/oauth.js";
import { runJobsRoutes } from "./routes/runJobs.js";

export function createServer(ctx: AppContext) {
  const app = new Hono();
  app.use(
    "*",
    honoLogger((msg) => ctx.logger.info({ tag: "http" }, msg)),
  );
  app.route("/", healthRoutes());
  app.route(
    "/api/agents",
    agentRoutes({
      agentService: ctx.agentService,
      publicBaseUrl: ctx.config.publicBaseUrl,
      db: ctx.db,
    }),
  );
  app.route(
    "/webhooks/linear",
    linearWebhookRoutes({ db: ctx.db, agentService: ctx.agentService }),
  );
  app.route("/api/agent-run-jobs", runJobsRoutes({ db: ctx.db }));
  app.route(
    "/oauth",
    oauthRoutes({
      db: ctx.db,
      agentService: ctx.agentService,
      publicBaseUrl: ctx.config.publicBaseUrl,
      linearLive: ctx.config.linearLive,
      encryptionKey: ctx.config.encryptionKey,
    }),
  );
  return app;
}
