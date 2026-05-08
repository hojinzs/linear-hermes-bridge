# Architecture

## Overview

Linear Hermes Bridge is a self-hosted router between Linear Agent OAuth apps and local Hermes Agent instances.

It owns public integration concerns:

- OAuth install and callback endpoints.
- Linear webhook signature verification.
- Agent registry and routing.
- Session mapping.
- Agent Run Queue scheduling and async Agent Runner execution.
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
|  | SQLite + encrypted token/session/job state  |  |
|  +---------------------------------------------+  |
|           |                                       |
|           v                                       |
|  +---------------------------------------------+  |
|  | Agent Run Queue                            |  |
|  | durable jobs / retry / scheduling          |  |
|  +---------------------------------------------+  |
|           |                                       |
|           v                                       |
|  +---------------------------------------------+  |
|  | Orchestrator                               |  |
|  | claim / dispatch / reconcile               |  |
|  +---------------------------------------------+  |
|           |                                       |
|           v                                       |
|  +----------------+    +-----------------------+  |
|  | Agent Runner   | -> | Hermes connector      |  |
|  | session engine |    | local HTTP/CLI only   |  |
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

## Terminology: Queue vs Runner vs Worker

The bridge uses these terms deliberately:

| Term | Meaning in this project |
| --- | --- |
| Agent Run Queue | Durable scheduling layer for accepted Linear work. It stores job state, dedupe keys, retry/backoff, priority, and concurrency inputs. |
| Orchestrator | Coordination layer that claims eligible jobs, creates run attempts, reconciles stale work, and applies retry/cancel policy. |
| Agent Runner | Agent-domain execution engine. It builds prompt envelopes, starts/resumes Hermes sessions, invokes connectors, captures progress, and normalizes final output. |
| Worker Process | Deployment/runtime host. In the MVP it is inside the single bridge service; later it may become a separate container that polls the queue and hosts Agent Runner instances. |

Short rule: the queue manages work state, the orchestrator decides what should run, the Agent Runner performs the semantic Hermes run, and a Worker Process is only the deployable host.

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

### 5. Agent Run Queue

Stores accepted Linear work as durable, retryable Agent Run Jobs.

Responsibilities:

- Create one `agent_run_jobs` row per accepted, deduplicated webhook delivery.
- Preserve queue status, priority, `scheduled_at`, retry/backoff metadata, and redacted input.
- ACK webhooks quickly while Hermes execution continues asynchronously.
- Provide a future migration path from in-process queue polling to BullMQ/Redis without changing the Agent Runner contract.

### 6. Orchestrator

Coordinates when queued work should run.

Responsibilities:

- Claim eligible Agent Run Jobs while respecting per-agent and global concurrency.
- Create `run_attempts` for each execution attempt.
- Reconcile stale/running attempts using heartbeat and timeout metadata.
- Apply cancellation, retry, backoff, and drain/shutdown policies.
- Emit runner lifecycle events for operator visibility.

#### Reconciliation thresholds

Defaults applied by the MVP Orchestrator (override per agent only when justified):

| Threshold | Default | Purpose |
| --- | --- | --- |
| `heartbeat_timeout_ms` | `60_000` | Attempts whose `heartbeat_at` is older than this are considered stale and eligible for retry/abort. |
| `claim_lease_ms` | `30_000` | Time between `claimed` and the first runner heartbeat before the claim is released. |
| `attempt_timeout_ms` | per-agent connector `timeoutMs` | Hard cap for a single attempt; on expiry the attempt becomes `timed_out`. |
| `retry_backoff` | exponential, `min=15s`, `max=10m` | Used to set `scheduled_at` when an attempt fails and `attempt_count < max_attempts`. |

#### Cancellation flow

Cancellation is expressed in data, not in messages:

1. The operator (Admin UI / API) sets `agent_run_jobs.cancel_requested_at`.
2. The Orchestrator observes the column on its claim/reconcile loop and, if the job has an active attempt, signals the Agent Runner (in-process function call for MVP, queue message in future deployments).
3. The Agent Runner finalizes the active attempt as `canceled` (or `timed_out` if the runner hangs past `attempt_timeout_ms`).
4. The Orchestrator transitions the job to `canceled` after the active attempt reaches a terminal state.

Jobs in `queued` with `cancel_requested_at` set are transitioned directly to `canceled` without creating a new attempt.

### 7. Session mapper

Maps Linear interaction sessions to Hermes sessions.

Typical key:

```text
linear_organization_id + linear_agent_session_id -> hermes_session_key
```

Fallback for non-AgentSession payloads:

```text
linear_organization_id + issue_id + agent_id -> hermes_session_key
```

### 8. Agent Runner

The Agent Runner is the semantic execution engine for a single agent run. It is not the same as a generic Worker Process. A Worker Process is a deployable host that may poll the queue; the Agent Runner owns the Hermes session lifecycle.

Responsibilities:

- Fetch any extra Linear issue/comment/session context needed for the run.
- Build the Hermes prompt envelope from bridge policy, Linear context, and user instruction.
- Start or resume the mapped Hermes session.
- Invoke Hermes through the selected connector.
- Stream progress/final events back to the Orchestrator and Linear Response Writer.
- Mark attempts succeeded, failed, canceled, or awaiting input.

### 9. Hermes connector

MVP connector types:

1. `localWebhook` — bridge posts to Hermes generic webhook using `X-Webhook-Signature`.
2. `apiServer` — bridge calls a local Hermes API server endpoint if enabled.
3. `cli` — bridge runs `hermes chat -q` as a fallback for simple homelab setups.

Connector selection is per agent.

### 10. Linear response writer

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
User mentions @Hermes Agent or delegates issue
  -> Linear sends AgentSessionEvent/app notification webhook
  -> bridge verifies linear-signature
  -> bridge normalizes event and enqueues Agent Run Job
  -> bridge immediately returns 200/202
  -> Orchestrator claims eligible job and creates run_attempt
  -> Agent Runner fetches extra issue/comment context if needed
  -> Agent Runner builds Hermes prompt
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
You are Hermes Agent connected as Linear app `PM Agent`.

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
| Duplicate webhook delivery | Idempotency key prevents duplicate Agent Run Jobs and Hermes runs. |

## Scalability boundaries

MVP is intentionally single-node:

- SQLite file.
- In-process Agent Run Queue.
- One Docker Compose service hosting HTTP edge, Orchestrator, Agent Runner, and Web UI API.

Future scale path:

- Postgres instead of SQLite.
- Redis/BullMQ instead of in-process Agent Run Queue.
- Separate API, Worker Process, Agent Runner, and UI containers.
- Organization-level multi-tenant support.
