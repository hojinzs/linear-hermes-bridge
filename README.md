# Linear Hermes Bridge

Self-hosted Linear Agent bridge for Hermes Agent. It lets a homelab user install one or more Linear OAuth `actor=app` agents, expose only OAuth/webhook/Web UI endpoints through a public tunnel, and route Linear mentions/delegations to local Hermes agents or profiles.

> Status: MVP design repository. The first milestone is documentation and architecture clarity before implementation.

## MVP in one sentence

Run a Docker Compose stack that receives Linear Agent webhooks over a Cloudflare Tunnel (or equivalent), maps each Linear app/user to a local Hermes agent/profile, sends instructions to Hermes over a local-only connection, and returns results to Linear as comments or Agent Activity.

## Core requirements

1. **Homelab-friendly Docker deployment** — `docker compose up -d`, persistent local volume, SQLite by default.
2. **Public tunnel boundary** — public OAuth/webhook/Web UI address via Cloudflare Tunnel/ngrok/Tailscale Funnel; Hermes itself remains private and local-only.
3. **Multi-agent routing** — one bridge instance can manage many Linear OAuth apps and route each to a separate Hermes profile, endpoint, or command policy.
4. **TypeScript-first stack** — bridge service, worker queue, Web UI, and Linear integration should be implemented primarily in TypeScript.

## Documentation map

- [`docs/requirements.md`](docs/requirements.md) — MVP and non-goals.
- [`docs/architecture.md`](docs/architecture.md) — components, data flow, sequence diagrams.
- [`docs/data-model.md`](docs/data-model.md) — SQLite-first schema and entity relationships.
- [`docs/deployment.md`](docs/deployment.md) — Docker Compose, tunnel, and local Hermes connectivity.
- [`docs/linear-setup.md`](docs/linear-setup.md) — manual Linear OAuth app setup and smoke test.
- [`docs/api-contracts.md`](docs/api-contracts.md) — MVP HTTP route contracts and payload shapes.
- [`docs/security.md`](docs/security.md) — auth, signatures, token storage, human approval boundaries.
- [`docs/implementation-plan.md`](docs/implementation-plan.md) — TypeScript implementation phases and tasks.
- [`docs/open-decisions.md`](docs/open-decisions.md) — decisions Steve should make before build.
- [`docs/review-log.md`](docs/review-log.md) — five review passes performed before initial commit.

## Proposed stack

| Layer | MVP choice | Notes |
| --- | --- | --- |
| Runtime | Node.js 22 + TypeScript | Familiar, Docker-friendly, good Linear SDK support. |
| HTTP server | Fastify or Hono | Hono is attractive for Cloudflare-style portability; Fastify is strong for self-hosted Node. |
| Web UI | React + Vite | Lightweight admin UI for agent registry and install status. |
| Database | SQLite + Drizzle ORM | Homelab-friendly single-file persistence. |
| Background jobs | In-process queue first, BullMQ optional later | Webhooks must ACK quickly; execution should happen async. |
| Tunnel | Cloudflare Tunnel documented, alternatives allowed | Bridge receives public traffic; Hermes does not. |
| Hermes connection | Local HTTP API/webhook first, CLI fallback | Keep Hermes private on localhost/LAN. |

## High-level flow

```text
Linear / Browser
  -> public HTTPS tunnel
  -> linear-hermes-bridge container
  -> local-only Hermes endpoint/CLI
  -> Linear comment or Agent Activity response
```

## Repository state

This repository intentionally starts as a design-first project. Implementation should begin only after the open decisions are resolved or accepted as MVP defaults.
