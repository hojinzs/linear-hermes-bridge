# Linear Hermes Bridge Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task after the design decisions are accepted.

**Goal:** Build a TypeScript-first, Docker-deployable Linear Agent bridge that routes Linear OAuth app mentions/delegations to local Hermes Agent targets.

**Architecture:** A single Node.js service initially owns HTTP routes, Admin UI API, SQLite persistence, encrypted credential storage, in-process Agent Run Queue, Orchestrator, Agent Runner execution, Hermes connector abstraction, and Linear response writing. Public traffic enters through a tunnel/reverse proxy; Hermes remains local-only.

**Tech Stack:** TypeScript, Node.js 22, Hono or Fastify, React + Vite, SQLite, Drizzle ORM, Zod, Docker Compose.

---

## Phase 0. Decisions and repository bootstrap

### Task 0.1: Choose HTTP framework

**Objective:** Decide between Hono and Fastify before code starts.

**Files:**
- Modify: `docs/open-decisions.md`

**Decision criteria:**
- Hono: smaller, Cloudflare-compatible style, simple route handlers.
- Fastify: mature Node server ecosystem, strong plugins, strong performance.

**MVP default if undecided:** Hono.

**Verification:** Decision recorded with rationale.

### Task 0.2: Initialize TypeScript workspace

**Objective:** Create the initial TypeScript project skeleton.

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `apps/bridge/package.json`
- Create: `apps/bridge/src/index.ts`
- Create: `apps/web/package.json`

**Verification:**

```bash
pnpm install
pnpm typecheck
```

Expected: install succeeds and empty typecheck passes.

## Phase 1. Configuration, database, and encryption

### Task 1.1: Add typed config loader

**Objective:** Validate required env vars at startup.

**Files:**
- Create: `apps/bridge/src/config.ts`
- Create: `apps/bridge/src/config.test.ts`

**Implementation notes:**
- Use Zod.
- Validate `PUBLIC_BASE_URL`, `DATABASE_URL`, `ENCRYPTION_KEY`, `APP_SECRET`, `PORT`.
- Ensure `PUBLIC_BASE_URL` is HTTPS unless in development mode.

**Verification:**

```bash
pnpm test config
```

### Task 1.2: Add encryption utility

**Objective:** Encrypt/decrypt sensitive strings with AES-256-GCM.

**Files:**
- Create: `apps/bridge/src/crypto/encryption.ts`
- Create: `apps/bridge/src/crypto/encryption.test.ts`

**Verification cases:**
- round trip succeeds,
- ciphertext changes for same plaintext due to random nonce,
- wrong key fails,
- empty string rejected or handled explicitly.

### Task 1.3: Add SQLite schema and migrations

**Objective:** Implement tables from `docs/data-model.md`.

**Files:**
- Create: `apps/bridge/src/db/schema.ts`
- Create: `apps/bridge/src/db/client.ts`
- Create: `drizzle.config.ts`
- Create: `apps/bridge/src/db/migrations/*`
- Include: `agent_run_jobs`, `run_attempts`, and `runner_events` tables from `docs/data-model.md`.

**Verification:**

```bash
pnpm db:migrate
pnpm db:studio # optional local inspection
```

## Phase 2. Agent registry and Admin API

### Task 2.1: Agent CRUD API

**Objective:** Manage agent records through typed API endpoints.

**Files:**
- Create: `apps/bridge/src/routes/agents.ts`
- Create: `apps/bridge/src/services/agents.ts`
- Create: `apps/bridge/src/routes/agents.test.ts`

**Endpoints:**

```text
GET /api/agents
POST /api/agents
GET /api/agents/:slug
PATCH /api/agents/:slug
POST /api/agents/:slug/disable
POST /api/agents/:slug/enable
```

**Verification:** API tests pass with temporary SQLite DB.

### Task 2.2: Minimal Admin UI

**Objective:** Let a homelab operator create and inspect agents.

**Files:**
- Create: `apps/web/src/pages/AgentsPage.tsx`
- Create: `apps/web/src/pages/AgentDetailPage.tsx`
- Create: `apps/web/src/api/client.ts`

**MVP UI:**
- list agents,
- create agent,
- show callback/webhook URLs,
- show install URL,
- show status.

**Verification:** Manual browser smoke test.

## Phase 3. Linear OAuth installation

### Task 3.1: OAuth authorize route

**Objective:** Generate Linear install URL for an agent using `actor=app`.

**Files:**
- Create: `apps/bridge/src/routes/oauth.ts`
- Create: `apps/bridge/src/services/oauthState.ts`

**Route:**

```text
GET /oauth/authorize/:agentSlug
```

**Verification:** URL includes `client_id`, `redirect_uri`, `response_type=code`, `state`, `scope`, `actor=app`.

### Task 3.2: OAuth callback route

**Objective:** Exchange code for token and store installation.

**Files:**
- Modify: `apps/bridge/src/routes/oauth.ts`
- Create: `apps/bridge/src/services/linearOAuth.ts`

**Route:**

```text
GET /oauth/callback/:agentSlug
```

**Verification:** Mock Linear token exchange stores encrypted token and deletes state.

### Task 3.3: Token refresh/revocation handling

**Objective:** Handle expiring tokens and revoked app events.

**Files:**
- Create: `apps/bridge/src/services/tokenRefresh.ts`
- Modify: `apps/bridge/src/routes/webhooks.ts`

**Verification:** Mock refresh updates encrypted token; revoked event marks installation `revoked`.

## Phase 4. Linear webhook ingestion

### Task 4.1: Raw body and signature verification

**Objective:** Verify `linear-signature` before JSON parsing side effects.

**Files:**
- Create: `apps/bridge/src/routes/linearWebhook.ts`
- Create: `apps/bridge/src/security/linearSignature.ts`
- Create: `apps/bridge/src/security/linearSignature.test.ts`

**Route:**

```text
POST /webhooks/linear/:agentSlug
```

**Verification:** Valid HMAC passes; invalid HMAC rejects; no job enqueued on invalid signature.

### Task 4.2: Event normalization

**Objective:** Convert Linear payloads into internal trigger events.

**Files:**
- Create: `apps/bridge/src/linear/normalizeEvent.ts`
- Create: `apps/bridge/src/linear/types.ts`
- Create: `apps/bridge/src/linear/normalizeEvent.test.ts`

**Supported MVP inputs:**
- AgentSessionEvent `created`,
- AgentSessionEvent `prompted`,
- app notification mention/delegation fallback.

**Verification:** Fixture payloads normalize to stable internal types.

### Task 4.3: Idempotent Agent Run Job enqueue

**Objective:** ACK quickly and create one Agent Run Job per unique delivery.

**Files:**
- Create: `apps/bridge/src/agentRunQueue/enqueue.ts`
- Create: `apps/bridge/src/agentRunQueue/types.ts`

**Verification:** Duplicate delivery ID or payload hash does not create duplicate Agent Run Job.

## Phase 5. Orchestrator, Agent Runner, and Hermes connector

### Task 5.1: Orchestrator and claim loop

**Objective:** Claim eligible Agent Run Jobs, create run attempts, and apply basic concurrency/retry policy.

**Files:**
- Create: `apps/bridge/src/orchestrator/claimLoop.ts`
- Create: `apps/bridge/src/orchestrator/retryPolicy.ts`
- Create: `apps/bridge/src/orchestrator/types.ts`

**Verification:** Queued jobs are claimed once, stale attempts are retried, and per-agent concurrency is enforced.

### Task 5.2: Agent Runner interface

**Objective:** Define the semantic runner that starts/resumes Hermes sessions for one Agent Run Job.

**Files:**
- Create: `apps/bridge/src/runner/agentRunner.ts`
- Create: `apps/bridge/src/runner/events.ts`
- Create: `apps/bridge/src/runner/types.ts`

**Verification:** Runner creates a run attempt, emits lifecycle events, calls the selected Hermes connector, and records final status.

### Task 5.3: Connector interface

**Objective:** Define a connector abstraction so each agent can target webhook/API/CLI.

**Files:**
- Create: `apps/bridge/src/hermes/connector.ts`
- Create: `apps/bridge/src/hermes/types.ts`

**Interface sketch:**

```ts
interface HermesConnector {
  run(input: HermesRunInput): Promise<HermesRunResult>;
}
```

### Task 5.4: Local webhook connector

**Objective:** Post normalized prompt to Hermes generic webhook with `X-Webhook-Signature`.

**Files:**
- Create: `apps/bridge/src/hermes/localWebhookConnector.ts`
- Create: `apps/bridge/src/hermes/localWebhookConnector.test.ts`

**Verification:** Request is signed correctly and timeout behavior is tested.

### Task 5.5: CLI connector fallback

**Objective:** Execute `hermes chat -q` for local prototype use.

**Files:**
- Create: `apps/bridge/src/hermes/cliConnector.ts`

**Safety:** CLI connector disabled by default unless agent policy enables it.

**Verification:** Mock child process success, timeout, and non-zero exit.

## Phase 6. Prompt builder and Linear response writer

### Task 6.1: Prompt builder

**Objective:** Build a policy-aware Hermes prompt from Linear context.

**Files:**
- Create: `apps/bridge/src/prompts/buildHermesPrompt.ts`
- Create: `apps/bridge/src/prompts/buildHermesPrompt.test.ts`

**Verification:** Prompt separates policy, context, and user content.

### Task 6.2: Linear comment writer

**Objective:** Post Hermes result back to Linear issue/comment thread.

**Files:**
- Create: `apps/bridge/src/linear/commentWriter.ts`
- Create: `apps/bridge/src/linear/client.ts`

**Verification:** Mock GraphQL mutation creates comment with correct issue ID and optional parent ID.

### Task 6.3: Agent Activity phase-two stub

**Objective:** Prepare interface for Agent Activity without depending on unstable details.

**Files:**
- Create: `apps/bridge/src/linear/activityWriter.ts`

**Verification:** No-op implementation compiles; docs mark as phase two.

## Phase 7. Docker and smoke test

### Task 7.1: Dockerfile and Compose

**Objective:** Build and run the bridge locally.

**Files:**
- Create: `Dockerfile`
- Create: `docker-compose.yml`
- Create: `.env.example`

**Verification:**

```bash
docker compose up -d --build
curl http://localhost:8787/healthz
```

### Task 7.2: End-to-end local smoke test

**Objective:** Simulate a Linear webhook and verify Hermes connector invocation.

**Files:**
- Create: `scripts/smoke-linear-webhook.ts`
- Create: `docs/smoke-test.md`

**Verification:** Signed fixture webhook creates an Agent Run Job, Agent Runner attempt, and mocked Linear response.

## Phase 8. GitHub release readiness

### Task 8.1: CI workflow

**Objective:** Run typecheck, lint, tests, and Docker build on PRs.

**Files:**
- Create: `.github/workflows/ci.yml`

**Verification:** GitHub Actions passes.

### Task 8.2: First alpha release docs

**Objective:** Document installation and known limitations.

**Files:**
- Create: `docs/alpha-release-checklist.md`

**Verification:** Checklist covers install, tunnel, Linear app setup, Hermes connection, smoke test, backup, and rollback.
