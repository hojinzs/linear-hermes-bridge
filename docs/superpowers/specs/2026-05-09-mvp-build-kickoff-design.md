# MVP Vertical Slice — Build Kickoff Design

> Date: 2026-05-09
> Author: Steve + Claude (brainstorming session)
> Status: Approved for implementation
> Goal: Take linear-hermes-bridge from design-only to a runnable, locally-testable vertical slice in one autonomous session.

## 1. Purpose

The repository currently contains design documents only. This spec defines the *first* implementation slice — what gets built in one autonomous overnight session, what is mocked, what is intentionally deferred, and how Steve verifies the result the next morning.

The slice is not a production-ready bridge. It is a working end-to-end skeleton that exercises every architectural seam (config → DB → webhook → queue → orchestrator → runner → connector → linear writer) using mocks at the external boundaries (Linear, Hermes), so the next sessions can replace mocks one boundary at a time.

## 2. Slice Boundary

### IN — built in this session

| Layer | Items |
| --- | --- |
| Bootstrap | pnpm workspace, `apps/bridge`, `apps/web`, `tsconfig.base.json`, `biome.json`, `vitest.config.ts`, `drizzle.config.ts` |
| Config / crypto | `src/config.ts` (Zod), `src/crypto/encryption.ts` (AES-256-GCM), `src/logger.ts` (pino with redaction) |
| DB | All 8 tables from `docs/data-model.md`: `agents`, `oauth_states`, `linear_installations`, `agent_sessions`, `webhook_deliveries`, `agent_run_jobs`, `run_attempts`, `runner_events`. Drizzle schema + first migration. |
| Agent service | CRUD + enable/disable + `test-hermes` |
| OAuth routes | `GET /oauth/authorize/:slug` (URL builder), `GET /oauth/callback/:slug` (mock token exchange in dev), dev-only `POST /oauth/dev/install/:slug` |
| Webhook ingest | `POST /webhooks/linear/:slug` with raw-body HMAC verification, event normalization, dedupe key, idempotent enqueue |
| Queue | `agent_run_jobs` insert with dedupe, in-process polling claim loop |
| Orchestrator | Claim, retry, heartbeat reconciliation, cancellation |
| Agent Runner | Prompt builder, connector dispatch, run_attempts insert, runner_events emit, terminal status |
| Connectors | `mockConnector` (immediate fake response) + `localWebhookConnector` (HMAC-signed POST, timeout) |
| Linear writer | `mockWriter` (logs to runner_events + pino) + `linearWriter` stub (no live GraphQL call this session) |
| Admin UI | Mantine app with 4 pages: AgentsList, AgentCreate, AgentDetail, RunJobs |
| Dev experience | `pnpm dev` (auto bootstrap), `pnpm dev:seed` (mock agent + installation), `pnpm smoke` (signed fixture webhook) |
| Tests | Vitest unit tests for crypto, signature, normalize, dedupe, claim, runner, prompt builder; one integration smoke. |
| Docs | UAT acceptance test guide. |

### OUT — explicitly deferred

- Live Linear OAuth token exchange (real POST to Linear)
- Live Linear comment creation (real GraphQL mutation)
- Admin UI authentication / login page / session middleware
- Docker / docker-compose / Dockerfile
- CI workflow
- Linear Agent Activity writer
- CLI connector
- Token refresh flow
- Rate limiting and body size enforcement (default Hono only)
- Per-agent workspace allowlist
- Backup / restore scripts
- Phase 8 release docs (per `docs/implementation-plan.md`; not to be confused with our own slice phase 8)

These are tracked for follow-up sessions.

## 3. Locked Decisions (Open Decisions D1–D9)

| ID | Decision | Source |
| --- | --- | --- |
| D1 | Hono | open-decisions default |
| D2 | localWebhook + mock first; cli later | open-decisions default + slice mock |
| D3 | localhost-only Admin UI; auth deferred to next session | open-decisions default |
| D4 | Comment-only; Activity writer is a stub | open-decisions default |
| D5 | Manual agent registration; no Hermes profile discovery | open-decisions default |
| D6 | `permission_policy.defaultMode = "plan-only"` | open-decisions default |
| D7 | pnpm | open-decisions default |
| D8 | Project name `linear-hermes-bridge` | open-decisions default |
| D9 | Queue / Orchestrator / Agent Runner terminology retained | open-decisions default |

## 4. Toolchain

| Concern | Choice |
| --- | --- |
| Monorepo | pnpm workspaces only (no Turborepo) |
| TypeScript | strict mode, `noUncheckedIndexedAccess: true` |
| Test runner | Vitest |
| Lint / format | Biome (single tool) |
| ORM | Drizzle |
| HTTP server | Hono |
| Validation | Zod |
| Process orchestration | `pnpm -r --parallel run dev` |
| Logger | pino with redaction list from `docs/security.md` |
| Git hooks | none in this slice |

## 5. Mock Infrastructure

### 5.1 Mock connector

`hermes_connector_type = "mock"` selects `mockConnector`.

```ts
async run(input: HermesRunInput): Promise<HermesRunResult> {
  // 100–300ms randomized delay; emit one heartbeat
  return {
    ok: true,
    output: {
      summary: `Mock Hermes acknowledged: ${input.userInstruction.slice(0, 80)}`,
      events: [...]
    },
    hermesSessionKey: `mock_${randomUUID()}`,
  };
}
```

A `--slow` mode (5s delay) is supported for cancellation testing.

### 5.2 Mock Linear writer

`mockWriter`:
- Inserts `runner_events.linear_response_posted` row.
- `pino.info({ tag: "mock.linear.comment", issueId, body, parentCommentId })`.
- Returns a synthetic `commentId = "mock_cmt_<uuid>"`.

`linearWriter` (real GraphQL implementation) compiles but delegates to `mockWriter` unless `LINEAR_LIVE === "true"` (off by default). This keeps the real wire format in scope for later sessions while keeping this slice mock-only.

### 5.3 Mock OAuth dev install

`POST /oauth/dev/install/:slug` (dev-only, refuses if `LINEAR_LIVE === "true"`):
- Inserts `linear_installations` row with `linear_organization_id = "org_dev"`, fake encrypted access token.
- Returns `{ ok: true, installationId }`.

The `seed` script calls this so the morning UAT does not need any browser-driven OAuth dance.

## 6. Dev Bootstrap

`pnpm dev` runs `scripts/dev-bootstrap.ts` then `pnpm -r --parallel run dev`.

Bootstrap script behavior (idempotent):
1. If `.env` does not exist, copy `.env.example`.
2. If `.env` is missing `ENCRYPTION_KEY` or `APP_SECRET`, generate random values and append (with a warning log saying these are dev-only).
3. Ensure `data/` directory exists.
4. Run `drizzle migrate` against `data/bridge.db`.

Per-app dev:
- `apps/bridge`: `tsx watch src/index.ts` on port 8787, bound to 127.0.0.1.
- `apps/web`: `vite` on port 5173 with proxy for `/api`, `/oauth`, `/webhooks` → `http://127.0.0.1:8787`.

`pnpm dev:seed`:
- Inserts a `mock-agent` row (`hermes_connector_type=mock`, fixed dev secrets).
- Calls the dev OAuth install endpoint to create one installation.

`pnpm smoke`:
- Loads `apps/bridge/fixtures/agent-session-prompted.json`.
- Computes HMAC-SHA256 with the dev webhook secret.
- POSTs to `/webhooks/linear/mock-agent` with `linear-signature` header.
- Polls `/api/agent-run-jobs/:id` until `succeeded` or 30s timeout.
- Flags: `--slow` (slower mock connector), `--bad-sig` (intentionally invalid signature for negative test).

## 7. Admin UI

Stack: React 18 + Mantine + Vite + react-router-dom v6.

Pages:

1. **AgentsListPage** (`/agents`) — table of agents (slug, display name, enabled, connector, installations, last activity); empty state instructs `pnpm dev:seed`.
2. **AgentCreatePage** (`/agents/new`) — Mantine `useForm` + Zod resolver; fields per `docs/api-contracts.md` POST body; secrets via `SecretInput` (write-only).
3. **AgentDetailPage** (`/agents/:slug`) — sections: URLs (callback / webhook / install with copy buttons), Linear installations, Test Hermes button, recent run jobs.
4. **RunJobsPage** (`/run-jobs`) — filterable table (agent, status); row click opens drawer with input/output JSON, runner_events timeline, Cancel button. 30s auto-refresh.

Layout:
- `AppShell` with left nav.
- `DevBanner` (yellow) at top: "auth not implemented · dev only".

## 8. Build Sequencing

Each phase ends in one commit on `feat/mvp-vertical-slice`. Unit tests must pass before commit. If a phase blocks, stop and document remaining state in PR body — do not skip ahead.

| Phase | Commit | Output |
| --- | --- | --- |
| 0 | `chore: bootstrap pnpm workspace` | workspace + tsconfig + biome + vitest + placeholder bridge/web entries; `pnpm typecheck` passes |
| 1 | `feat(bridge): config, encryption, logger` | Zod config, AES-GCM crypto, pino; tests pass |
| 2 | `feat(db): drizzle schema and migrations` | 8 tables, migration file, `pnpm db:migrate`; round-trip test passes |
| 3 | `feat(api,web): agent CRUD with list/create/detail UI` | services + routes + Mantine pages (URLs section); manual create works |
| 4 | `feat(webhook): linear signature, normalize, dedupe, enqueue` | webhook receiver, normalize, dedupe key, idempotent enqueue; tests cover signed/duplicate/invalid |
| 5 | `feat(hermes,linear): connector interface, mock, local webhook, mock writer` | connector + writer interfaces, mock + localWebhook implementations; test-hermes endpoint |
| 6 | `feat(runner): agent runner with prompt builder and lifecycle events` | prompt builder, runner; emits all runner_events |
| 7 | `feat(orchestrator): claim loop, retry, cancellation` | claim loop with concurrency, heartbeat reconciliation, cancel flow |
| 8 | `feat(web,oauth): run jobs page, mock oauth dev install` | RunJobsPage drawer, OAuth authorize URL builder, dev install endpoint |
| 9 | `chore(dev): bootstrap, seed, smoke webhook` | dev-bootstrap.ts, dev-seed.ts, smoke-webhook.ts, fixture JSON, root scripts |
| 10 | `docs(uat): mvp slice acceptance test guide` | `docs/uat/2026-05-09-mvp-vertical-slice.md` |

After phase 10, `gh pr create` against `main`.

## 9. UAT Acceptance Test Guide

A Markdown file at `docs/uat/2026-05-09-mvp-vertical-slice.md` is the morning checklist. Required sections:

1. **Purpose** — one-liner.
2. **Prerequisites** — Node 22, pnpm 9, free ports 8787/5173, fresh checkout, no real Linear/Hermes needed.
3. **Setup** — `pnpm install`, `pnpm typecheck`, `pnpm test` with expected output snippets.
4. **Bootstrap + start** — `pnpm dev` with the literal expected console output.
5. **Scenarios** (UI-driven, each with checkboxes):
   - A. First page load (banner, nav, empty state)
   - B. `pnpm dev:seed` → mock-agent appears
   - C. AgentDetail → URLs visible, Test Hermes ok
   - D. Manual agent creation (optional)
   - E. `pnpm smoke` → successful run job + 6 runner events
   - F. Duplicate `pnpm smoke` → idempotent (no new job)
   - G. `pnpm smoke -- --slow` + UI cancel → status `canceled` within 5s
   - H. `pnpm smoke -- --bad-sig` → HTTP 401, no job
6. **Pass criteria** — all scenarios pass + `pnpm test` green + `pnpm typecheck` clean + biome lint clean.
7. **Known limitations** — same as §2 OUT list, in user-facing language.
8. **Troubleshooting** — port conflicts, missing env, DB lock, queued-stuck.
9. **Links** — back to this spec.

## 10. Verification Strategy

- **Unit tests** (Vitest): per-phase, run via `pnpm test`. Coverage targets: crypto round-trip, HMAC, normalize fixtures (3), dedupe collisions, queue insert idempotency, claim/heartbeat/cancel transitions, runner emits all events, prompt sections separated.
- **Integration smoke**: `pnpm smoke` end-to-end via real HTTP loopback through the running dev server.
- **Manual UAT**: scenarios A–H by Steve in the morning.
- **Static**: `pnpm typecheck` (0 errors), `biome check` (0 warnings or PR-body-justified).

## 11. Risk and Stop Conditions

The autonomous session must stop and write a "stopped here" note in the PR body if any of these occur:

- Two consecutive phases fail tests after one retry.
- A design ambiguity discovered mid-implementation that conflicts with this spec (do not silently improvise — document and stop).
- Mantine choice turns out to be incompatible with chosen router (extremely unlikely; fall back to react-router).
- Drizzle migration runtime errors that need schema redesign.

The PR body must always list: phases completed, phase that stopped, what works, what does not, suggested next-session entry point.

## 12. Out-of-scope reminders for follow-up sessions

For the session that picks this up, the obvious next slices are (in order of dependency):

1. Admin UI auth (Q3 option 2 from brainstorming).
2. Real Linear OAuth token exchange.
3. Real Linear comment writer (`LINEAR_LIVE=true` path).
4. Docker Compose + Dockerfile.
5. CI workflow.
6. CLI connector and Agent Activity writer.

These are not blockers for the MVP slice and are intentionally excluded here to keep this session shippable in one shot.
