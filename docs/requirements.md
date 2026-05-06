# Requirements

## Product goal

Build a self-hosted bridge that lets Linear users delegate work to local Hermes Agent instances from inside Linear, without exposing Hermes directly to the public internet.

The product is aimed at homelab users who are comfortable with Docker Compose and tunnels, but do not want to build a bespoke Linear OAuth integration from scratch.

## Personas

### Homelab operator

- Runs Docker Compose services on a home server, NAS, mini PC, or VPS.
- Uses Cloudflare Tunnel, ngrok, Tailscale Funnel, Caddy, or Traefik to expose selected services.
- Wants clear `.env` configuration, persistent volumes, and easy logs.

### Linear workspace admin

- Can create/install Linear OAuth apps.
- Wants each agent to appear as a recognizable Linear app user.
- Needs clear callback/webhook URLs and required scopes.

### Linear teammate

- Mentions or delegates to an agent from an issue/comment/Agent Session.
- Expects visible progress and a final answer in Linear.
- Remains the human owner of work; the agent acts as delegate.

## MVP requirements

### R1. Docker-first self-hosted deployment

- Provide a Docker image and `docker-compose.yml`.
- Default persistence uses a local SQLite file mounted in a volume.
- Required configuration is supplied through `.env`.
- The service must boot with no external managed database.
- Logs must be visible through `docker compose logs`.

### R2. Public tunnel, private Hermes

- Public endpoints are only the bridge endpoints:
  - OAuth authorize/callback
  - Linear webhook receiver
  - optional admin Web UI
- The public base URL can be supplied by Cloudflare Tunnel or equivalent.
- Hermes Agent communication must be local-only by default:
  - `http://host.docker.internal:<port>` on Docker Desktop,
  - Docker host gateway on Linux,
  - same Docker network if Hermes is containerized,
  - or a local CLI command executed on the host/container.
- The bridge must not require exposing Hermes directly to Linear or the browser.

### R3. Multi-agent routing

- One bridge instance can manage multiple agent records.
- Each agent record maps:
  - Linear OAuth app credentials,
  - Linear webhook secret,
  - Linear installation/workspace token,
  - Hermes target endpoint/profile/command,
  - routing and permission policy.
- Admin UI should support adding, editing, enabling, and disabling agents.
- If Hermes profile discovery is implemented later, discovered profiles can pre-fill agent records, but manual setup is acceptable for MVP.

### R4. Linear Agent interaction

- Support Linear OAuth installation using `actor=app`.
- Support scopes required for mention/delegation:
  - `read`,
  - `comments:create`,
  - `app:mentionable`,
  - `app:assignable`,
  - optionally `write` / `issues:create` depending on enabled capabilities.
- Receive Linear Agent Session or app notification webhooks.
- Acknowledge webhooks quickly and process work asynchronously.
- Return at least a Linear comment for MVP.
- Agent Activity support is preferred but can be a phase-two improvement if API stability is uncertain.

### R5. TypeScript-first implementation

- Core service must be TypeScript.
- Shared types should model Linear payloads, agent records, Hermes execution requests, and job states.
- Use typed env/config validation.
- Prefer libraries with strong TypeScript support.

### R6. Safety and human gates

- The bridge must distinguish low-risk tasks from gated tasks.
- Default low-risk actions:
  - summarize,
  - clarify,
  - create implementation plan,
  - post comments,
  - inspect allowed context.
- Default gated actions:
  - code changes,
  - PR creation unless explicitly requested,
  - issue status changes,
  - writes to external systems.
- Always gated or forbidden by default:
  - merge,
  - deploy,
  - delete data,
  - rotate secrets,
  - destructive commands.

## Non-goals for MVP

- SaaS multi-tenant billing or hosting.
- Automatic Linear OAuth app creation inside Linear.
- Kubernetes Helm chart.
- Full Linear Agent Activity lifecycle parity.
- Automatic merge/deploy flows.
- Enterprise SSO or organization policy management.

## Success criteria

- A homelab user can start the stack from Docker Compose.
- A public tunnel points to the bridge and Linear can call OAuth/webhook endpoints.
- At least two Linear apps can route to two different Hermes targets.
- A Linear mention produces a Hermes-generated response back in Linear.
- Hermes remains unexposed to the public internet.
