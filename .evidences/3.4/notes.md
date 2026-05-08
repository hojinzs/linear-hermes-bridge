# Task 3.4 — Agents pages evidence

## Files modified
- `apps/web/src/pages/AgentsListPage.tsx` — Mantine Table, empty-state alert with seed hint, error state, click-row to detail
- `apps/web/src/pages/AgentCreatePage.tsx` — Mantine `useForm` with Zod-style validators, JsonInput for connector config + permissionPolicy, slug regex check
- `apps/web/src/pages/AgentDetailPage.tsx` — Card with CopyableUrl rows, Disable/Enable + Test Hermes actions, status badge

## Orchestrator updates
- `playwright.config.ts` — extended webServer to start bridge first (with deterministic e2e env: ENCRYPTION_KEY all-zeros, sqlite at `.evidences/_e2e/`), then web. `rm -rf .evidences/_e2e` resets DB on every run.
- `.gitignore` — exclude `.evidences/_e2e/` and `.evidences/_playwright-report/`.
- 3.3 shell test updated: stubs no longer exist after 3.4; updated to validate real headings.

## Verification
- `pnpm --filter @lhb/web typecheck` → exit 0
- `pnpm --filter @lhb/web build` → exit 0 (428 KB JS, 134 KB gzipped)
- `pnpm test` (vitest) → 26/26 passing
- `pnpm lint` → 1 warning only (services test non-null assertion from spec)
- **`pnpm test:e2e` → 9/9 passing**:
  - 0.3 title smoke (1)
  - 3.3 app shell (4): root redirect, header+nav+banner, Run Jobs nav, real pages
  - 3.4 CRUD (4): empty hint, form create + URLs visible, disable/enable toggle, table row visible

## Deviations
- Used `getByRole("link", ...)` instead of "button" in tests because Mantine Button with `component={Link}` renders an `<a>` element.
- 3.3 stub assertions changed to heading-based assertions — stubs were replaced by real pages.
