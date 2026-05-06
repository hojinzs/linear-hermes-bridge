# Open Decisions

These are the decisions Steve should make or explicitly accept as MVP defaults before implementation begins.

## D1. HTTP framework

**Question:** Hono or Fastify?

**Default:** Hono.

**Rationale:** The service is mostly webhook/OAuth/API routing, and Hono keeps the code small and portable. Fastify remains a good alternative if plugin ecosystem and mature Node server ergonomics matter more.

## D2. Hermes connector priority

**Question:** Which Hermes connector should be implemented first?

Options:

1. `localWebhook` — post to Hermes generic webhook adapter.
2. `apiServer` — call Hermes API server if enabled.
3. `cli` — execute `hermes chat -q` locally.

**Default:** `localWebhook` first, `cli` fallback second.

**Rationale:** It keeps Hermes private while avoiding direct process/config mounting. Existing Hermes webhook adapter may need routes enabled, but the bridge can re-sign Linear payloads with `X-Webhook-Signature`.

## D3. Admin UI exposure

**Question:** Should the Admin UI be public behind auth or localhost-only by default?

**Default:** localhost/tunnel-protected with login; recommend Cloudflare Access if exposed.

**Rationale:** The UI manages OAuth credentials and should not be casually public.

## D4. Agent Activity support in MVP

**Question:** Should MVP require Linear Agent Activity updates, or is comment-only enough?

**Default:** comment-only MVP, Agent Activity interface stub.

**Rationale:** Linear Agent APIs are Developer Preview. Comments prove the integration while reducing API volatility risk.

## D5. Automatic Hermes profile discovery

**Question:** Should the bridge discover local Hermes profiles automatically?

**Default:** manual agent creation first.

**Rationale:** Dockerized discovery would require mounting Hermes config/state, which weakens isolation. Add discovery later as an optional local-helper feature.

## D6. Default action policy

**Question:** What can the agent do automatically from Linear?

**Default:** plan/comment-only unless the agent policy explicitly enables more.

**Rationale:** Linear issue content is user-controlled and can contain prompt injection. The safest MVP is to make the bridge a planning/delegation surface first.

## D7. Repository package manager

**Question:** pnpm, npm, or yarn?

**Default:** pnpm.

**Rationale:** Good monorepo support and fast installs. Docker image can still use Corepack.

## D8. Project name

**Question:** Keep `linear-hermes-bridge` or choose a branded name?

**Default:** `linear-hermes-bridge`.

**Rationale:** Clear and searchable. A branded name can come later.
