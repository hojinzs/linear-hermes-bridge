# Smoke test runbook (Phase 7.2)

End-to-end verification that a signed Linear webhook flows through the bridge,
creates an Agent Run Job, drives the Agent Runner against a mock connector,
and lands a mocked Linear response.

> The live integration runbook (real Linear + real Hermes) lives at
> `../SMOKE_TEST.md`. This document covers the **local** and **docker** smoke
> paths used for development and release verification.

## Modes

| Mode | Where the bridge runs | Connector | When to use |
| --- | --- | --- | --- |
| Local (host) | `pnpm dev` on the developer machine | `mock` | Fast inner loop, also the CI/PR smoke. |
| Docker | `docker compose up -d` | `mock` for the smoke, configured Hermes connector in real use | Verify production image build + bridge startup. |

The signed webhook smoke uses the `mock` connector regardless of how the
bridge is launched, so it does not require a real Hermes Agent endpoint. Real
Hermes execution should use an explicit connector such as `localWebhook`; if
that endpoint is unavailable, the bridge should expose the connector error
instead of falling back to local command execution.

---

## 1. Local mode (host)

Prerequisites: Node 22, pnpm, repo checked out.

```bash
pnpm install
pnpm dev:bootstrap   # generates .env keys + applies migrations  (also wrapped in `pnpm dev`)
pnpm dev:seed        # creates the `mock-agent` + dev installation
pnpm --filter @lhb/bridge dev   # in another terminal — bridge listens on :8787
pnpm smoke           # signs the fixture webhook and waits for terminal status
```

`pnpm smoke` exits 0 when the run reaches `succeeded`. Useful flags:

- `pnpm smoke -- --slow` — randomises the `deliveryId` so re-runs do not hit
  the dedupe path; also widens the wait timeout.
- `pnpm smoke -- --bad-sig` — sends an intentionally invalid signature and
  expects `401`. Fails the script if the bridge accepts it.

What it asserts (per `scripts/smoke-webhook.ts`):

1. `POST /webhooks/linear/mock-agent` returns `agentRunJobId` and `status` is
   not `duplicate` (unless `--slow` was already run with the same delivery).
2. Polling `GET /api/agent-run-jobs/:id` shows the runner_events progress.
3. The job lands on `succeeded` within the timeout (default 30s).

---

## 2. Docker mode

```bash
# 1. Make sure ENCRYPTION_KEY / APP_SECRET are populated in .env
pnpm dev:bootstrap   # safe to re-run; only fills empties
# 2. Build + start the container
docker compose up -d --build
# 3. Verify the bridge is listening
curl -fsS http://127.0.0.1:8787/healthz
# 4. Tear down
docker compose down
```

`/healthz` returning `200` proves: the image built, migrations applied (the
SQLite file is created under `./data`), the bridge bound to `0.0.0.0:8787`
inside the container, and the host port mapping works.

To exercise the full webhook flow against the dockerised bridge, seed the
container's database from the **host**. The bridge container mounts
`./data:/app/data` and uses `DATABASE_URL=file:/app/data/bridge.db`, which is
the same SQLite file `pnpm dev:seed` writes when `.env` has
`DATABASE_URL=file:./data/bridge.db` (the default from `pnpm dev:bootstrap`).
So seeding from the host lands rows the container will see — no need to run
`tsx`/devDeps inside the production image:

```bash
# 1. Make sure the host .env points at the same SQLite file the container uses.
grep -E '^DATABASE_URL=' .env   # expect: DATABASE_URL=file:./data/bridge.db
# 2. Seed using host tooling (tsx is a devDep, available on the host only).
pnpm dev:seed
# 3. Drive the webhook flow against the dockerised bridge.
pnpm smoke
```

---

## 3. What success looks like

- `pnpm smoke` prints `[smoke] final status: succeeded` and exits `0`.
- `pnpm smoke -- --bad-sig` prints `[smoke] bad signature correctly rejected
  with 401` and exits `0`.
- `curl :8787/healthz` returns HTTP 200 in docker mode.
- `docker compose ps` shows the bridge container as `healthy` after the
  start-period (the image's HEALTHCHECK pings `/healthz` itself).

If any of those fail: capture the bridge logs (`docker compose logs bridge`
or `apps/bridge` stdout) plus the offending request/response, and treat it as
a release blocker.
