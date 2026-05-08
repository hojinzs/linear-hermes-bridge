## Summary

Implements the MVP vertical slice per [`docs/superpowers/specs/2026-05-09-mvp-build-kickoff-design.md`](docs/superpowers/specs/2026-05-09-mvp-build-kickoff-design.md), executing [`docs/superpowers/plans/2026-05-09-mvp-vertical-slice-plan.md`](docs/superpowers/plans/2026-05-09-mvp-vertical-slice-plan.md).

End-to-end skeleton with mocks at the external boundaries (Linear, Hermes). Every architectural seam is exercised: config → DB → webhook ingest → queue dedupe → orchestrator claim → runner with lifecycle events → mock connector → mock linear writer → run jobs UI.

Built by an agent team (codex backend + claude frontend), test-first, with per-task evidence captured under `.evidences/{phase}.{task}/`.

## What works

- pnpm workspace + bridge (Hono) + web (React + Mantine) build and run
- All 8 SQLite tables migrated; encrypted secrets at rest (AES-256-GCM)
- Agent CRUD API + UI (list, create, detail with URLs and installations)
- Linear webhook receiver with HMAC verification, normalization (3 fixtures), idempotent enqueue with 3-tier dedupe key
- In-process orchestrator: claim loop, per-agent concurrency, heartbeat reconciliation, retry backoff, cancellation
- Agent runner emits `claimed → context_loaded → prompt_built → hermes_started → progress → linear_response_posted → completed`
- Mock Hermes connector (with `--slow` mode) and Mock Linear writer
- localWebhookConnector implemented (HMAC-signed POST, timeout) — not used in this slice
- OAuth authorize URL builder + dev mock install endpoint
- Run Jobs UI with timeline drawer + cancel
- `pnpm dev` / `pnpm dev:seed` / `pnpm smoke` all work without external dependencies

## Verification (all green)

- `pnpm typecheck` → 0 errors (bridge + web)
- `pnpm test` → **66 vitest passing across 20 files** (TDD-first throughout)
- `pnpm lint` → clean, 1 warning (verbatim from spec: `services/agents.test.ts:81 list[0]!` non-null assertion)
- `pnpm test:e2e` → **10 Playwright tests passing across 4 spec files** including full webhook → succeeded UI verification
- `pnpm smoke` (manual) → all 4 modes (good, bad-sig, duplicate, slow) succeed

## Evidence

`.evidences/{phase}.{task}/` contains per-task artifacts:
- `notes.md` — files written, deviations
- `source.txt` — `cat` of source files for review
- `verify.txt` — typecheck + test + lint output snapshot
- `tdd-green.txt` (Phase 1+) — Vitest output proving TDD red→green
- `curl-*.txt` (routes) — curl smoke for HTTP routes
- `playwright/*.spec.ts` (frontend) — reusable e2e specs

## What is intentionally out of scope (next sessions)

- Real Linear OAuth token exchange (real POST to Linear)
- Real Linear GraphQL comment creation
- Admin UI authentication / login page
- Docker / docker-compose / Dockerfile
- CI workflow
- Linear Agent Activity writer
- CLI connector
- Token refresh flow

## Test plan (User acceptance)

Follow [`docs/uat/2026-05-09-mvp-vertical-slice.md`](docs/uat/2026-05-09-mvp-vertical-slice.md) top to bottom.

- [ ] Prerequisites pass (Node 22, pnpm 9, free ports)
- [ ] `pnpm install && pnpm typecheck && pnpm test` all green
- [ ] `pnpm dev` boots cleanly with bootstrap log
- [ ] Scenario A: first page load with banner + nav
- [ ] Scenario B: `pnpm dev:seed` produces mock agent + installation
- [ ] Scenario C: agent detail shows URLs + Test Hermes succeeds
- [ ] Scenario E: `pnpm smoke` produces `succeeded` job with 6+ runner events
- [ ] Scenario F: duplicate `pnpm smoke` returns `duplicate`
- [ ] Scenario G: `pnpm smoke -- --slow` + UI cancel transitions to `canceled`
- [ ] Scenario H: `pnpm smoke -- --bad-sig` returns 401, no job created

🤖 Generated with [Claude Code](https://claude.com/claude-code)
