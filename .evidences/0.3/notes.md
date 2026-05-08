# Task 0.3 — Web app skeleton evidence

## Files created
- `apps/web/package.json` — @lhb/web with Mantine 7, React 18, react-router-dom 6, Vite 5
- `apps/web/tsconfig.json`, `apps/web/vite.config.ts`, `apps/web/index.html`
- `apps/web/src/main.tsx`, `apps/web/src/App.tsx`
- Root `playwright.config.ts` (added by orchestrator) — testDir `.evidences`, baseURL `localhost:5173`, webServer auto-boots vite
- `.evidences/0.3/playwright/smoke.spec.ts` — placeholder smoke test

## Deviations from plan
- `main.tsx` non-null assertion replaced with explicit null check (biome `noNonNullAssertion` rule).
- Root `package.json` extended with `@playwright/test` devDep + `test:e2e` script (foundational tooling for all subsequent frontend tasks).

## Verification
- `pnpm install` → exit 0 (web pkg + 87 deps installed).
- `pnpm -r typecheck` → exit 0 (bridge + web both clean).
- `pnpm --filter @lhb/web build` → exit 0 (213 kB bundle, 776 modules).
- `pnpm test` (vitest) → 1/1 passing (bridge healthz).
- `pnpm lint` → exit 0 (15 files clean after auto-fix).
- `curl http://localhost:5173/` → 200, HTML with `<title>Linear Hermes Bridge — Admin</title>` and `<div id="root">`.
- `pnpm test:e2e` (playwright chromium) → 1/1 passing — page title + placeholder text visible.

## Browsers
- Chromium 1217 installed via `npx playwright install` (~/Library/Caches/ms-playwright/).
