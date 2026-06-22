# UAT — MVP Vertical Slice (2026-05-09)

This is the morning checklist. Following these steps top-to-bottom verifies that the MVP slice is working. No real Linear workspace, no Hermes process, no tunnel needed.

Spec: [`docs/superpowers/specs/2026-05-09-mvp-build-kickoff-design.md`](../superpowers/specs/2026-05-09-mvp-build-kickoff-design.md)
Plan: [`docs/superpowers/plans/2026-05-09-mvp-vertical-slice-plan.md`](../superpowers/plans/2026-05-09-mvp-vertical-slice-plan.md)

## 1. Prerequisites

- [ ] Node.js 22.x (`node -v`)
- [ ] pnpm 9.x (`pnpm -v`)
- [ ] Ports 8787 and 5173 free (`lsof -iTCP:8787 -sTCP:LISTEN; lsof -iTCP:5173 -sTCP:LISTEN` returns nothing)
- [ ] Repo checked out at the merged commit (or PR branch `feat/mvp-vertical-slice`)
- [ ] Real Linear/Hermes are **not** required

## 2. Setup

```bash
pnpm install
pnpm typecheck
pnpm test
```

Expected: install succeeds, `typecheck` reports 0 errors, `pnpm test` reports all tests passing.

## 3. Bootstrap and start

In one terminal:

```bash
pnpm dev
```

Expected console output (lines may interleave between bridge and web):

```
[bootstrap] .env created from .env.example
[bootstrap] generated dev ENCRYPTION_KEY (saved to .env)
[bootstrap] generated dev APP_SECRET (saved to .env)
[bootstrap] running migrations…
[migrate] applied migrations from ...
[bootstrap] migrations applied
[bridge] listening on http://127.0.0.1:8787   (or pino-formatted "bridge listening")
[web]  ➜  Local:   http://localhost:5173/
```

## 4. Scenarios

### A. First page load

1. Open http://localhost:5173.

- [ ] Yellow banner reads "auth not implemented · localhost-only · do not expose publicly"
- [ ] Left nav shows "Agents" and "Run Jobs"
- [ ] Page lands on `/agents` and shows the empty state ("No agents yet")

### B. Seed mock agent

In another terminal:

```bash
pnpm dev:seed
```

- [ ] Output includes `[seed] created agent slug=mock-agent`
- [ ] Output includes `[seed] created mock linear installation org=org_dev`
2. Reload http://localhost:5173/agents.
- [ ] One row visible: `mock-agent`, connector `mock`, status enabled

### C. Agent detail

1. Click the `mock-agent` row.
- [ ] Detail page shows callback / webhook / install URLs with copy buttons
- [ ] "Linear installations" section shows one row (`org_dev`, status `installed`)
2. Click "Test Hermes".
- [ ] Notification reads "OK in <Xms>" within 1 second

### D. Manual agent creation (optional)

1. Click "New agent". Fill: slug `test-agent`, displayName `Test`, connector `mock`, leave defaults for the rest. Submit.
- [ ] Redirects to `/agents/test-agent` and shows three URLs

### E. Smoke webhook (the core)

In another terminal:

```bash
pnpm smoke
```

- [ ] Output `[smoke] agent_run_job arj_... accepted`
- [ ] Output sequence `runner_events: claimed → context_loaded → workspace_prepared → prompt_built → hermes_started → progress → progress → linear_response_posted → completed`
- [ ] Final line `[smoke] final status: succeeded`
- [ ] Bridge log shows a line with `tag":"mock.linear.comment"` and the issue identifier `ENG-123`

Open the Run Jobs page in the browser:
- [ ] One row, status `succeeded`
- [ ] Click row → drawer shows the timeline of 6+ events with payload JSON

### F. Idempotency

```bash
pnpm smoke
```

- [ ] Output line `[smoke] duplicate delivery, no new job`
- [ ] Run Jobs page row count is unchanged (still 1)

### G. Cancellation

```bash
pnpm smoke -- --slow &
```

(Runs in background.)

1. Quickly open the Run Jobs page, click the new row.
- [ ] Status `running`
2. Click "Cancel".
- [ ] Status transitions to `canceled` within ~5 seconds
- [ ] Drawer shows a `canceled` terminal event

### H. Bad signature

```bash
pnpm smoke -- --bad-sig
```

- [ ] Output `[smoke] bad signature correctly rejected with 401`
- [ ] Run Jobs page row count unchanged

## 5. Pass criteria

- [ ] Scenarios A–E pass
- [ ] Scenarios F, G, H pass
- [ ] `pnpm test` is green
- [ ] `pnpm typecheck` reports 0 errors
- [ ] `pnpm lint` is clean (warnings on placeholder files OK and noted in PR body)

## 6. Known limitations (out of scope for this slice)

- Real Linear OAuth token exchange — `/oauth/callback/:slug` returns a dev acknowledgement only
- Real Linear comment writing — uses `mockWriter`; no GraphQL call leaves the host
- Admin UI authentication — banner declares this; bind is localhost only
- Docker / docker-compose — not built in this slice
- CI / GitHub Actions — not built in this slice
- CLI Hermes connector — not implemented
- Linear Agent Activity writer — interface exists as stub, no writer

## 7. Troubleshooting

- **Port 8787 already in use**: `lsof -iTCP:8787 -sTCP:LISTEN | awk '/LISTEN/ {print $2}' | xargs -r kill`
- **`.env` corrupt or partial**: delete `.env` and re-run `pnpm dev`; bootstrap regenerates dev keys
- **DB locked**: stop `pnpm dev`, delete `data/bridge.db`, re-run `pnpm dev`
- **Run job stuck in `queued`**: orchestrator did not start. Verify the bridge log shows "bridge listening" and the orchestrator tick interval is 250ms; restart `pnpm dev`.
- **Webhook returns 404 unknown agent**: agent not seeded. Run `pnpm dev:seed`.
