import { Hono } from "hono";
import { enqueueAgentRunJob } from "../agentRunQueue/enqueue.js";
import type { DbClient } from "../db/client.js";
import { normalizeLinearEvent } from "../linear/normalizeEvent.js";
import { verifyLinearSignature } from "../security/linearSignature.js";
import type { AgentService } from "../services/agents.js";

export function linearWebhookRoutes(deps: { db: DbClient; agentService: AgentService }) {
  const { db, agentService } = deps;
  const app = new Hono();

  app.post("/:slug", async (c) => {
    const slug = c.req.param("slug");
    const agent = await agentService.getBySlugWithSecrets(slug);
    if (!agent) return c.json({ error: "not_found" }, 404);
    if (!agent.enabled) return c.json({ ok: true, status: "ignored", reason: "disabled" }, 200);

    const rawBody = await c.req.text();
    const sig = c.req.header("linear-signature") ?? "";
    if (!verifyLinearSignature({ rawBody, signature: sig, secret: agent.linearWebhookSecret })) {
      return c.json({ error: "invalid_signature" }, 401);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return c.json({ error: "invalid_json" }, 400);
    }
    const event = normalizeLinearEvent(parsed);
    if (!event) return c.json({ ok: true, status: "ignored", reason: "unsupported_event" }, 200);

    const result = enqueueAgentRunJob({
      db,
      agentId: agent.id,
      trigger: event,
      rawBody,
    });
    return c.json({ ok: true, status: result.status, agentRunJobId: result.agentRunJobId }, 202);
  });

  return app;
}
