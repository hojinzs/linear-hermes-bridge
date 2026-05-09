import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { encrypt } from "../crypto/encryption.js";
import { type DbClient, schema } from "../db/client.js";
import { LinearGraphqlClient } from "../linear/client.js";
import { exchangeLinearCode } from "../linear/oauthExchange.js";
import type { AgentService } from "../services/agents.js";
import { newId } from "../services/ids.js";

const LINEAR_OAUTH_BASE = "https://linear.app/oauth/authorize";

export function oauthRoutes(deps: {
  db: DbClient;
  agentService: AgentService;
  publicBaseUrl: string;
  linearLive: boolean;
  encryptionKey: Buffer;
  fetchImpl?: typeof fetch;
}) {
  const { db, agentService, publicBaseUrl, linearLive, encryptionKey, fetchImpl } = deps;
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
    const errorParam = c.req.query("error");
    if (errorParam) {
      return c.json({ error: "linear_oauth_denied", detail: errorParam }, 400);
    }
    if (!state || !code) return c.json({ error: "missing_params" }, 400);
    const stateRow = db
      .select()
      .from(schema.oauthStates)
      .where(eq(schema.oauthStates.state, state))
      .get();
    if (!stateRow) return c.json({ error: "invalid_state" }, 400);
    if (new Date(stateRow.expiresAt).getTime() < Date.now()) {
      db.delete(schema.oauthStates).where(eq(schema.oauthStates.state, state)).run();
      return c.json({ error: "state_expired" }, 400);
    }
    db.delete(schema.oauthStates).where(eq(schema.oauthStates.state, state)).run();

    const agent = await agentService.getBySlugWithSecrets(slug);
    if (!agent) return c.json({ error: "not_found" }, 404);

    if (!linearLive) {
      return c.json({ ok: true, agentSlug: slug, status: "dev_callback_received" });
    }

    let token: Awaited<ReturnType<typeof exchangeLinearCode>>;
    try {
      token = await exchangeLinearCode({
        clientId: agent.linearClientId,
        clientSecret: agent.linearClientSecret,
        code,
        redirectUri: `${base}/oauth/callback/${slug}`,
        ...(fetchImpl && { fetchImpl }),
      });
    } catch (e) {
      return c.json({ error: "token_exchange_failed", detail: (e as Error).message }, 502);
    }

    let viewer: Awaited<ReturnType<LinearGraphqlClient["viewer"]>>;
    try {
      const client = new LinearGraphqlClient(token.access_token, undefined, fetchImpl);
      viewer = await client.viewer();
    } catch (e) {
      return c.json({ error: "viewer_query_failed", detail: (e as Error).message }, 502);
    }

    const tokenExpiresAt = token.expires_in
      ? new Date(Date.now() + token.expires_in * 1000).toISOString()
      : null;
    const scopes = token.scope ? token.scope.split(/[ ,]+/).filter(Boolean) : agent.requiredScopes;

    const existing = db
      .select()
      .from(schema.linearInstallations)
      .where(eq(schema.linearInstallations.agentId, agent.id))
      .all()
      .find((row) => row.linearOrganizationId === viewer.organization.id);

    const now = new Date().toISOString();
    if (existing) {
      db.update(schema.linearInstallations)
        .set({
          accessTokenEnc: encrypt(token.access_token, encryptionKey),
          refreshTokenEnc: token.refresh_token ? encrypt(token.refresh_token, encryptionKey) : null,
          tokenExpiresAt,
          scopes,
          status: "installed",
          linearOrganizationName: viewer.organization.name,
          updatedAt: now,
        })
        .where(eq(schema.linearInstallations.id, existing.id))
        .run();
      return c.json({
        ok: true,
        agentSlug: slug,
        installationId: existing.id,
        organizationId: viewer.organization.id,
        organizationName: viewer.organization.name,
        status: "updated",
      });
    }

    const id = newId("inst");
    db.insert(schema.linearInstallations)
      .values({
        id,
        agentId: agent.id,
        linearOrganizationId: viewer.organization.id,
        linearOrganizationName: viewer.organization.name,
        accessTokenEnc: encrypt(token.access_token, encryptionKey),
        refreshTokenEnc: token.refresh_token ? encrypt(token.refresh_token, encryptionKey) : null,
        tokenExpiresAt,
        scopes,
        status: "installed",
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return c.json({
      ok: true,
      agentSlug: slug,
      installationId: id,
      organizationId: viewer.organization.id,
      organizationName: viewer.organization.name,
      status: "installed",
    });
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
