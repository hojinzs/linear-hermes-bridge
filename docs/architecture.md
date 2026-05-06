# Architecture

## Overview

Linear Hermes Bridge is a self-hosted router between Linear Agent OAuth apps and local Hermes Agent instances.

It owns public integration concerns:

- OAuth install and callback endpoints.
- Linear webhook signature verification.
- Agent registry and routing.
- Session mapping.
- Async job execution.
- Response delivery to Linear.

It does **not** expose Hermes directly. Hermes remains a local execution engine reachable only from the bridge host or Docker network.

## Component diagram

```text
                 Public Internet

Linear OAuth + Webhooks          Browser Admin UI
          |                             |
          v                             v
+---------------------------------------------------+
| Cloudflare Tunnel / ngrok / reverse proxy         |
+---------------------------------------------------+
                      |
                      v
+---------------------------------------------------+
| linear-hermes-bridge                              |
|                                                   |
|  +----------------+    +-----------------------+  |
|  | HTTP API       |    | Admin Web UI          |  |
|  | /oauth/*       |    | agent registry        |  |
|  | /webhooks/*    |    | install status        |  |
|  +----------------+    +-----------------------+  |
|           |                       |               |
|           v                       v               |
|  +---------------------------------------------+  |
|  | SQLite + encrypted token storage            |  |
|  +---------------------------------------------+  |
|           |                                       |
|           v                                       |
|  +----------------+    +-----------------------+  |
|  | Job queue      | -> | Hermes connector      |  |
|  | ACK fast       |    | local HTTP/CLI only   |  |
|  +----------------+    +-----------------------+  |
+---------------------------------------------------+
                      |
                      v
              Local network / localhost
                      |
                      v
+---------------------------------------------------+
| Hermes Agent                                      |
| profiles / webhook / API server / CLI             |
+---------------------------------------------------+
```

## Runtime modules

### 1. HTTP edge module

Responsibilities:

- Serve OAuth routes.
- Serve Linear webhook routes.
- Serve health checks.
- Serve Admin Web UI assets or API.
- Enforce request size limits and rate limits.

Candidate implementation:

- Hono on Node.js for a small, portable HTTP layer.
- Fastify if plugin ecosystem and self-hosted observability are prioritized.

### 2. Agent registry

Stores each bridge-managed agent:

- display name,
- slug,
- Linear OAuth app credentials,
- webhook secret,
- Hermes target type,
- Hermes target config,
- allowed Linear teams/workspaces,
- permission policy,
- enabled state.

### 3. OAuth install manager

Responsibilities:

- Generate `state` values.
- Build Linear authorization URLs with `actor=app`.
- Exchange authorization codes for tokens.
- Store access/refresh tokens encrypted at rest.
- Track organization/workspace installation.
- Revoke and rotate tokens.

### 4. Webhook receiver

Responsibilities:

- Read raw body.
- Verify `linear-signature` using the agent's webhook secret.
- Normalize payloads into internal trigger events.
- ACK within 5 seconds.
- Enqueue background work.

### 5. Session mapper

Maps Linear interaction sessions to Hermes sessions.

Typical key:

```text
linear_organization_id + linear_agent_session_id -> hermes_session_key
```

Fallback for non-AgentSession payloads:

```text
linear_organization_id + issue_id + agent_id -> hermes_session_key
```

### 6. Hermes connector

MVP connector types:

1. `localWebhook` — bridge posts to Hermes generic webhook using `X-Webhook-Signature`.
2. `apiServer` — bridge calls a local Hermes API server endpoint if enabled.
3. `cli` — bridge runs `hermes chat -q` as a fallback for simple homelab setups.

Connector selection is per agent.

### 7. Linear response writer

MVP response types:

- Linear issue comment.
- Thread reply when parent comment exists.

Phase two response types:

- Agent Activity progress updates.
- Agent Session external URLs.
- PR URL attachment to Agent Session.

## Sequence: install an agent

```text
Admin opens bridge UI
  -> creates Agent record
  -> copies Linear OAuth app settings from UI into Linear
  -> enters Linear client ID/secret/webhook secret into bridge
  -> clicks Install URL
  -> Linear OAuth authorize with actor=app
  -> /oauth/callback/:agentSlug receives code
  -> bridge exchanges code for token
  -> bridge stores installation
  -> UI shows installed workspace and scopes
```

## Sequence: mention/delegate in Linear

```text
User mentions @Ganesha-PM or delegates issue
  -> Linear sends AgentSessionEvent/app notification webhook
  -> bridge verifies linear-signature
  -> bridge normalizes event and enqueues job
  -> bridge immediately returns 200/202
  -> worker fetches extra issue/comment context if needed
  -> worker builds Hermes prompt
  -> Hermes connector invokes local Hermes
  -> bridge receives Hermes final response
  -> bridge posts Linear comment or Agent Activity
```

## Prompt construction

A Hermes prompt should include:

- bridge agent identity,
- Linear trigger type,
- user instruction,
- issue title/identifier/URL,
- issue description,
- relevant comment thread,
- Linear guidance if present,
- explicit capability policy,
- desired output channel and format.

Example prompt envelope:

```md
You are the Hermes agent connected as Linear app `Ganesha-PM`.

Linear context:
- Organization: <org>
- Issue: ABC-123 <title>
- URL: <url>
- Trigger: mention | delegation | prompted

User instruction:
<comment or AgentSession prompt>

Policy:
- You may summarize, ask clarifying questions, and draft plans.
- Do not merge, deploy, delete, or rotate credentials.
- If code/PR work is requested, state required approval unless explicitly allowed by policy.
```

## Multi-agent routing

Each public webhook URL is agent-scoped:

```text
/webhooks/linear/:agentSlug
/oauth/authorize/:agentSlug
/oauth/callback/:agentSlug
```

The bridge resolves `agentSlug`, then uses that agent's:

- Linear webhook secret,
- Linear token installation,
- Hermes connector config,
- permission policy.

This avoids ambiguous routing and lets multiple Linear OAuth apps share one bridge host.

## Failure handling

| Failure | Behavior |
| --- | --- |
| Signature invalid | 401/400, no job enqueued. |
| Agent disabled | 200 ignored or 403 depending config. |
| Missing installation token | Post admin-visible error if possible; mark install invalid. |
| Hermes timeout | Post Linear comment/activity saying the local agent timed out. |
| Linear comment write fails | Retry with backoff; record failed job. |
| Duplicate webhook delivery | Idempotency key prevents duplicate Hermes runs. |

## Scalability boundaries

MVP is intentionally single-node:

- SQLite file.
- In-process queue.
- One Docker Compose service.

Future scale path:

- Postgres instead of SQLite.
- Redis/BullMQ instead of in-process queue.
- Separate API, worker, and UI containers.
- Organization-level multi-tenant support.
