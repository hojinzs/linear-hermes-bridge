# Smoke Test Runbook

Live integration tests against real Linear + real Hermes Agent + Cloudflare tunnel.

When the user says **"smoke test"**, **"테스트해봐"**, **"이 시나리오 검증"**, or asks Claude to verify a specific behavior, follow this runbook.

---

## 1. Prerequisites — run these checks before any scenario

```bash
bash .smoke_test/preflight.sh
```

The script verifies in order:

1. Bridge alive on `:8787`
2. Public tunnel reachable at `https://lhb-dev.daapp.net`
3. Hermes gateway loaded (launchd PID set)
4. Hermes `lhb` webhook subscription active
5. `lhb-reply` hook loaded into hermes gateway
6. Bridge agent `daapp` has an installed Linear token
7. Token includes `write` scope (agentActivityCreate available; warns if missing — fallback path still works for plain comments)

Exit code 0 means safe to run any scenario. Non-zero means a check failed; the
script's red lines tell you which one and how to fix it. Stop until preflight
is green.

If any check fails, **stop and report which one** — do not proceed to the scenario. Common fixes:

| Failure | Fix |
|---|---|
| bridge :8787 down | `cd /Users/steve/Projects/linear-hermes-bridge/apps/bridge && PUBLIC_BASE_URL=... LINEAR_LIVE=true ... pnpm dev` |
| tunnel down | `wrangler tunnel run lhb-dev` (PID may have died — restart in background) |
| hermes gateway down | `hermes gateway restart` |
| installation missing or no `write` | User must visit `https://lhb-dev.daapp.net/oauth/authorize/daapp` to re-OAuth |

---

## 2. How to run a scenario

Each scenario lives in `.smoke_test/<scenario_name>/`. To run one:

1. `bash .smoke_test/preflight.sh` — must be green.
2. **Read** `.smoke_test/<scenario_name>/scenario.md` — has description, prerequisites, trigger, expected outcome.
3. **Confirm scenario-specific prerequisites** (e.g., a specific issue must exist, or no prior session in the thread).
4. **Execute trigger** using Linear MCP (`mcp__plugin_linear_linear__*`) per the file's "Trigger" section.
5. **Wait + monitor** the bridge log: `tail -f /tmp/bridge-live.log` and grep for the success pattern.
6. **Verify** by listing comments on the target issue and matching the assertions.
7. **Report** pass/fail with the produced commentId / activityId for traceability.

Use `Bash run_in_background: true` with an `until` loop when waiting for an event in the bridge log — never chain sleeps.

When the user just says "smoke test" without naming a scenario, run them in
this order: `top_level_mention` → `in_thread_followup` → `cross_event_dedupe`
→ `agent_activity_path`. Skip `delegate_on_create` unless they ask for it
(it creates a new issue and isn't ideal for repeated runs).

---

## 3. Scenarios available

| Name | What it tests |
|---|---|
| `top_level_mention` | First `@hermesagent` on an issue with no existing agent session — creates a new session, hits the `action=created` webhook path |
| `in_thread_followup` | Follow-up `@hermesagent` in an existing agent session thread — hits the `action=prompted` webhook path |
| `delegate_on_create` | New issue created with delegate=Hermes Agent — fires the same delegation flow Linear uses for assigned-to-agent issues |
| `cross_event_dedupe` | Verifies that one user comment producing both `AppUserNotification` + `AgentSessionEvent` collapses to a single reply |
| `agent_activity_path` | Verifies the writer uses `agentActivityCreate` (write scope required) so Linear marks the session as "responded" |

Each scenario directory contains:

- `scenario.md` — human-readable description + prerequisites + trigger + expected
- `verify.md` — verification queries (Linear comments to inspect, bridge log patterns)
- `notes.md` — anything specific you've learned by running this scenario

---

## 4. Adding a new scenario

When the user describes a new behavior they want to verify regularly:

1. Pick a snake_case `<scenario_name>`.
2. Create `.smoke_test/<scenario_name>/scenario.md` following the template at `.smoke_test/_template/scenario.md`.
3. Run it once interactively to confirm the assertions hold.
4. Add it to the table in §3.
5. Commit on the live branch.

---

## 5. Workspace state for live testing

| Setting | Value |
|---|---|
| Bridge agent slug | `daapp` |
| Bridge agent id | `agt_bfumF84E3SWnDPSq` |
| Linear OAuth client | `0ca7d50391aac5132237931a8ed0d055` |
| Linear app user | `Hermes Agent` (handle `@hermesagent`, id `c43d7a39-621c-48d4-9cff-d8aa60794f0a`) |
| Linear org | `hj-company` (id `f7846840-e7b5-4086-8797-09a83e252b35`) |
| Public webhook URL | `https://lhb-dev.daapp.net/webhooks/linear/daapp` |
| Public OAuth URL | `https://lhb-dev.daapp.net/oauth/authorize/daapp` |
| Hermes webhook subscription | `lhb` (URL `http://localhost:8644/webhooks/lhb`) |
| Hermes hook | `~/.hermes/hooks/lhb-reply/handler.py` |
| Bridge logs | `/tmp/bridge-live.log` |
| Hermes logs | `~/.hermes/logs/gateway.log` |
| Optional raw-body capture | set `LHB_DEBUG_WEBHOOK_LOG=/tmp/lhb-debug.log` and restart bridge |

Secrets (`Linear client_id/secret/webhook_secret`, Hermes HMAC, encryption key) live in `.env` and the bridge DB. **Never log or commit them.**

---

## 6. Stop conditions

Stop and report immediately if:

- The bridge crash-loops (more than 3 restarts in 60s in `/tmp/bridge-live.log`)
- Linear returns 401 / 403 on a path that worked five minutes ago (token revoked or scope removed)
- Hermes returns 5xx on `/webhooks/lhb` (gateway crash)
- Two scenarios fail with the same root cause (you've found a regression — fix before continuing other scenarios)
