import { appendFileSync } from "node:fs";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { enqueueAgentRunJob } from "../agentRunQueue/enqueue.js";
import { type DbClient, schema } from "../db/client.js";
import { normalizeLinearEvent } from "../linear/normalizeEvent.js";
import { verifyLinearSignature } from "../security/linearSignature.js";
import type { AgentService } from "../services/agents.js";

function isRevocationPayload(parsed: unknown): { organizationId: string | null } | null {
  if (!parsed || typeof parsed !== "object") return null;
  const root = parsed as Record<string, unknown>;
  const orgId = typeof root.organizationId === "string" ? root.organizationId : null;
  if (root.type === "OAuthAppRevoked") return { organizationId: orgId };
  if (root.type === "AppUserNotification" && root.action === "oauthAppRevoked") {
    return { organizationId: orgId };
  }
  return null;
}

// Optional raw-body debug capture for development. Set LHB_DEBUG_WEBHOOK_LOG to a
// writable path to enable; leave unset for normal operation.
const DEBUG_RAW_BODY_PATH = process.env.LHB_DEBUG_WEBHOOK_LOG;

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

    if (DEBUG_RAW_BODY_PATH) {
      try {
        appendFileSync(DEBUG_RAW_BODY_PATH, `\n${new Date().toISOString()}\t${slug}\t${rawBody}\n`);
      } catch {
        // ignore debug write errors
      }
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return c.json({ error: "invalid_json" }, 400);
    }

    const revoke = isRevocationPayload(parsed);
    if (revoke) {
      if (!revoke.organizationId) {
        return c.json({ ok: true, status: "ignored", reason: "missing_organization_id" }, 200);
      }
      db.update(schema.linearInstallations)
        .set({ status: "revoked", updatedAt: new Date().toISOString() })
        .where(
          and(
            eq(schema.linearInstallations.agentId, agent.id),
            eq(schema.linearInstallations.linearOrganizationId, revoke.organizationId),
          ),
        )
        .run();
      return c.json({ ok: true, status: "revoked" }, 200);
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
