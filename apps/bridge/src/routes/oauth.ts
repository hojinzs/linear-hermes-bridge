import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { encrypt } from "../crypto/encryption.js";
import { type DbClient, schema } from "../db/client.js";
import type { AgentService } from "../services/agents.js";
import { newId } from "../services/ids.js";

const LINEAR_OAUTH_BASE = "https://linear.app/oauth/authorize";

export function oauthRoutes(deps: {
  db: DbClient;
  agentService: AgentService;
  publicBaseUrl: string;
  linearLive: boolean;
  encryptionKey: Buffer;
}) {
  const { db, agentService, publicBaseUrl, linearLive, encryptionKey } = deps;
  const base = publicBaseUrl.replace(/\/+$/, "");
  const app = new Hono();

  app.get("/authorize/:slug", async (c) => {
    const slug = c.req.param("slug");
    const agent = await agentService.getBySlugWithSecrets(slug);
    if (!agent) return c.json({ error: "not_found" }, 404);
    const state = randomBytes(24).toString("base64url");
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    db.insert(schema.oauthStates)
      .values({
        state,
        agentId: agent.id,
        redirectAfter: null,
        expiresAt,
        createdAt: new Date().toISOString(),
      })
      .run();
    const url = new URL(LINEAR_OAUTH_BASE);
    url.searchParams.set("client_id", agent.linearClientId);
    url.searchParams.set("redirect_uri", `${base}/oauth/callback/${slug}`);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", agent.requiredScopes.join(","));
    url.searchParams.set("state", state);
    url.searchParams.set("actor", "app");
    return c.redirect(url.toString(), 302);
  });

  app.get("/callback/:slug", async (c) => {
    const slug = c.req.param("slug");
    const state = c.req.query("state");
    const code = c.req.query("code");
    if (!state || !code) return c.json({ error: "missing_params" }, 400);
    const stateRow = db
      .select()
      .from(schema.oauthStates)
      .where(eq(schema.oauthStates.state, state))
      .get();
    if (!stateRow) return c.json({ error: "invalid_state" }, 400);
    db.delete(schema.oauthStates).where(eq(schema.oauthStates.state, state)).run();

    if (!linearLive) {
      // Dev path: do not contact Linear; just return ok.
      return c.json({ ok: true, agentSlug: slug, status: "dev_callback_received" });
    }
    return c.json({ error: "live_oauth_not_implemented_in_slice" }, 501);
  });

  app.post("/dev/install/:slug", async (c) => {
    if (linearLive) return c.json({ error: "disabled_in_live_mode" }, 403);
    const slug = c.req.param("slug");
    const agent = await agentService.getBySlug(slug);
    if (!agent) return c.json({ error: "not_found" }, 404);
    const id = newId("inst");
    const now = new Date().toISOString();
    db.insert(schema.linearInstallations)
      .values({
        id,
        agentId: agent.id,
        linearOrganizationId: "org_dev",
        linearOrganizationName: "Dev Workspace",
        accessTokenEnc: encrypt("dev-mock-access-token", encryptionKey),
        refreshTokenEnc: null,
        tokenExpiresAt: null,
        scopes: ["read", "comments:create", "app:mentionable", "app:assignable"],
        status: "installed",
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return c.json({ ok: true, installationId: id });
  });

  return app;
}
