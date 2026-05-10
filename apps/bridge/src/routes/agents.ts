import { Hono } from "hono";
import { z } from "zod";
import type { DbClient } from "../db/client.js";
import type { AgentService } from "../services/agents.js";

const ConnectorTypeSchema = z.enum(["mock", "localWebhook", "apiServer", "cli"]);

const CreateBody = z.object({
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, "slug must be lowercase alphanumeric or hyphen"),
  displayName: z.string().min(1),
  description: z.string().nullable().optional(),
  iconUrl: z.string().url().nullable().optional(),
  linearClientId: z.string().min(1),
  linearClientSecret: z.string().min(1),
  linearWebhookSecret: z.string().min(1),
  requiredScopes: z.array(z.string()).min(1),
  hermesConnectorType: ConnectorTypeSchema,
  hermesConnectorConfig: z.unknown(),
  permissionPolicy: z.unknown(),
  maxConcurrentRuns: z.number().int().positive().optional(),
});

export function agentRoutes(deps: {
  agentService: AgentService;
  publicBaseUrl: string;
  db: DbClient;
}) {
  const { agentService, publicBaseUrl, db } = deps;
  const base = publicBaseUrl.replace(/\/+$/, "");
  const app = new Hono();

  function withUrls(slug: string, agent: unknown) {
    return {
      ...((agent ?? {}) as Record<string, unknown>),
      callbackUrl: `${base}/oauth/callback/${slug}`,
      webhookUrl: `${base}/webhooks/linear/${slug}`,
      installUrl: `${base}/oauth/authorize/${slug}`,
    };
  }

  app.get("/", async (c) => {
    const agents = await agentService.listSummaries();
    return c.json({ agents: agents.map((a) => withUrls(a.slug, a)) });
  });

  app.post("/", async (c) => {
    const json = await c.req.json().catch(() => null);
    const parsed = CreateBody.safeParse(json);
    if (!parsed.success) {
      return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
    }
    try {
      const created = await agentService.create({
        slug: parsed.data.slug,
        displayName: parsed.data.displayName,
        description: parsed.data.description ?? null,
        iconUrl: parsed.data.iconUrl ?? null,
        linearClientId: parsed.data.linearClientId,
        linearClientSecret: parsed.data.linearClientSecret,
        linearWebhookSecret: parsed.data.linearWebhookSecret,
        requiredScopes: parsed.data.requiredScopes,
        hermesConnectorType: parsed.data.hermesConnectorType,
        hermesConnectorConfig: parsed.data.hermesConnectorConfig,
        permissionPolicy: parsed.data.permissionPolicy,
        ...(parsed.data.maxConcurrentRuns !== undefined && {
          maxConcurrentRuns: parsed.data.maxConcurrentRuns,
        }),
      });
      return c.json({ agent: withUrls(created.slug, created) }, 201);
    } catch (e) {
      return c.json({ error: "create_failed", message: (e as Error).message }, 409);
    }
  });

  app.get("/:slug", async (c) => {
    const slug = c.req.param("slug");
    const agent = await agentService.getBySlug(slug);
    if (!agent) return c.json({ error: "not_found" }, 404);
    return c.json({ agent: withUrls(slug, agent) });
  });

  app.get("/:slug/installations", async (c) => {
    const { eq } = await import("drizzle-orm");
    const { schema } = await import("../db/client.js");
    const slug = c.req.param("slug");
    const agent = await agentService.getBySlug(slug);
    if (!agent) return c.json({ error: "not_found" }, 404);
    const rows = db
      .select()
      .from(schema.linearInstallations)
      .where(eq(schema.linearInstallations.agentId, agent.id))
      .all()
      .map((r) => ({
        id: r.id,
        organizationId: r.linearOrganizationId,
        organizationName: r.linearOrganizationName,
        status: r.status,
        scopes: r.scopes,
        createdAt: r.createdAt,
      }));
    return c.json({ installations: rows });
  });

  app.post("/:slug/enable", async (c) => {
    const slug = c.req.param("slug");
    const exists = await agentService.getBySlug(slug);
    if (!exists) return c.json({ error: "not_found" }, 404);
    await agentService.setEnabled(slug, true);
    return c.json({ ok: true });
  });

  app.post("/:slug/disable", async (c) => {
    const slug = c.req.param("slug");
    const exists = await agentService.getBySlug(slug);
    if (!exists) return c.json({ error: "not_found" }, 404);
    await agentService.setEnabled(slug, false);
    return c.json({ ok: true });
  });

  app.post("/:slug/test-hermes", async (c) => {
    const slug = c.req.param("slug");
    const agent = await agentService.getBySlugWithSecrets(slug);
    if (!agent) return c.json({ error: "not_found" }, 404);
    const { selectConnector } = await import("../hermes/selectConnector.js");
    let connector: ReturnType<typeof selectConnector>;
    try {
      connector = selectConnector({
        agentSlug: slug,
        hermesConnectorType: agent.hermesConnectorType,
        hermesConnectorConfig: agent.hermesConnectorConfig,
      });
    } catch (e) {
      return c.json({ ok: false, error: (e as Error).message }, 400);
    }
    if (!connector.ping) return c.json({ ok: true, latencyMs: 0, note: "no ping support" });
    const r = await connector.ping();
    return c.json({ ok: r.ok, latencyMs: r.latencyMs, connectorType: agent.hermesConnectorType });
  });

  return app;
}
