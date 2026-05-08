# Task 1.1 — Config loader evidence

## Files (3)
- `apps/bridge/src/config.test.ts` — written FIRST per TDD (6 test cases)
- `apps/bridge/src/config.ts` — Zod schema + `loadConfig` + `ConfigError`
- `.env.example` — keys for PUBLIC_BASE_URL, PORT, DATABASE_URL, ENCRYPTION_KEY, APP_SECRET, LINEAR_LIVE, LOG_LEVEL

## TDD cycle
- GREEN: 6/6 passing. See `tdd-green.txt`.

## Verification (orchestrator)
- `pnpm vitest run apps/bridge/src/config.test.ts` → 6/6 passing.
- `pnpm test` → 7/7 passing (1 healthz + 6 config).
- `pnpm -r typecheck` → exit 0.
- `pnpm lint` → exit 0 after biome auto-fix on test file import order.

## Deviations
- None. Biome auto-sort on imports.
