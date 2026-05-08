# Task 3.3 — Web app shell evidence

## Files written (orchestrator)
- `apps/web/src/api/client.ts` — typed fetch helper + agents/runJobs API
- `apps/web/src/components/{DevBanner,CopyableUrl,SecretInput,StatusBadge}.tsx`
- `apps/web/src/layout/AppShell.tsx` — Mantine AppShell with nav (Agents, Run Jobs), DevBanner header
- `apps/web/src/pages/{AgentsListPage,AgentCreatePage,AgentDetailPage,RunJobsPage}.tsx` — stubs (Task 3.4 fills them)
- `apps/web/src/App.tsx` — replaced placeholder with `<MantineProvider>` + `<BrowserRouter>` + routes

## Verification
- `pnpm --filter @lhb/web typecheck` → exit 0
- `pnpm --filter @lhb/web build` → exit 0 (257 KB JS bundle, 32 modules)
- `pnpm test` (vitest, bridge tests only) → 26/26 passing
- `pnpm lint` → 1 warning (services/agents.test.ts non-null assertion from spec verbatim — pre-existing)
- **`pnpm test:e2e`** → 5/5 passing:
  - 0.3 smoke (page title) ✓
  - 3.3 shell tests (4): redirect /, nav rendering, route navigation, stub pages ✓

## Deviations
- 0.3 placeholder Playwright spec was rewritten after App.tsx was replaced (placeholder text no longer exists). Now only asserts title. This is documented; baseline smoke remains green.
- Biome auto-sorted import order in `AppShell.tsx`.
