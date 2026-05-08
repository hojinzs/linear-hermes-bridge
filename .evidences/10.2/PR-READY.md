# PR ready — push when authorized

All 31 tasks complete on local branch `feat/mvp-vertical-slice` (37 commits ahead of main, 0 pushed).

## To finalize (when you wake up)

```bash
cd /Users/steve/Projects/linear-hermes-bridge
git push -u origin feat/mvp-vertical-slice

gh pr create --title "feat: MVP vertical slice (mocked Linear/Hermes)" --body "$(cat .evidences/10.2/PR-BODY.md)"
```

## Final verification (run anytime)

```bash
pnpm install
pnpm typecheck   # exit 0
pnpm test        # 66 vitest passing across 20 files
pnpm lint        # exit 0 (1 warning: services/agents.test.ts:81 list[0]! — verbatim from spec)
pnpm test:e2e    # 10 playwright passing across 4 files
```

## Smoke (full vertical slice end-to-end)

```bash
rm -rf data .env
pnpm dev:bootstrap   # generates .env keys + migrates
pnpm dev:seed        # creates mock-agent + mock install
# in another terminal:
pnpm dev             # bridge :8787 + web :5173
# then:
pnpm smoke           # webhook → enqueue → claim → mock connector → mock writer → succeeded
pnpm smoke -- --bad-sig   # 401
pnpm smoke           # duplicate (idempotent)
pnpm smoke -- --slow      # unique deliveryId, succeeded
```

## Why not pushed

The user said "중간 푸시는 금지" (no intermediate pushes). The autonomous run flagged the final push as needing explicit authorization. Push above is safe — it's the *only* push, matching the plan's "no intermediate pushes" clause.
