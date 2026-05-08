# Data Model

## Storage choice

MVP uses SQLite with encrypted sensitive fields. Drizzle ORM is the recommended TypeScript ORM because it is lightweight, typed, and works well with SQLite.

Sensitive values must not be stored in plaintext:

- Linear client secret,
- Linear webhook secret,
- OAuth access token,
- OAuth refresh token,
- Hermes shared secret or API token.

Use envelope encryption with a single `ENCRYPTION_KEY` for MVP. The key lives in `.env`, not the database.

## Entity overview

```text
agents
  1 -> many linear_installations
  1 -> many agent_sessions
  1 -> many webhook_deliveries
  1 -> many agent_run_jobs

linear_installations
  many -> 1 agents

agent_sessions
  many -> 1 agents
  1 -> many agent_run_jobs

webhook_deliveries
  many -> 1 agents
  1 -> zero/one agent_run_jobs

agent_run_jobs
  many -> 1 agents
  optional -> 1 agent_sessions
  1 -> many run_attempts

run_attempts
  many -> 1 agent_run_jobs
  many -> 1 agents
  many -> 1 agent_sessions
  1 -> many runner_events
```

## Naming rule

Do not collapse queue, runner, and worker concepts into a single `jobs` abstraction.

- `agent_run_jobs` represent durable queued work accepted from Linear.
- `run_attempts` represent each execution attempt for a queued job.
- `runner_events` represent the Agent Runner lifecycle/progress stream.
- A future Worker Process is a deployment host and does not need its own table unless multi-node runner registration becomes necessary.

## Tables

### agents

Represents one Linear app/Hermes target mapping.

| Column | Type | Notes |
| --- | --- | --- |
| id | text primary key | UUID or cuid. |
| slug | text unique | Used in URLs. |
| display_name | text | Linear-visible agent name. |
| description | text | Admin UI notes. |
| icon_url | text nullable | Optional icon. |
| enabled | integer boolean | Soft enable/disable. |
| linear_client_id | text | Not secret. |
| linear_client_secret_enc | text | Encrypted. |
| linear_webhook_secret_enc | text | Encrypted. |
| required_scopes | text JSON | Example: `["read","comments:create","app:mentionable"]`. |
| hermes_connector_type | text | `localWebhook`, `apiServer`, `cli`. |
| hermes_connector_config_enc | text | Encrypted JSON for endpoint/secret/command. |
| permission_policy | text JSON | Per-agent safety rules. |
| max_concurrent_runs | integer | Per-agent concurrency limit; default `1` for MVP. |
| created_at | text datetime | ISO 8601. |
| updated_at | text datetime | ISO 8601. |

### oauth_states

Short-lived CSRF protection for OAuth flow.

| Column | Type | Notes |
| --- | --- | --- |
| state | text primary key | Random 32+ bytes. |
| agent_id | text | FK agents.id. |
| redirect_after | text nullable | Optional UI return. |
| expires_at | text datetime | Short TTL. |
| created_at | text datetime | ISO 8601. |

### linear_installations

Represents an installed Linear workspace authorization for one agent.

| Column | Type | Notes |
| --- | --- | --- |
| id | text primary key | UUID/cuid. |
| agent_id | text | FK agents.id. |
| linear_organization_id | text | From OAuth/token introspection or API. |
| linear_organization_name | text nullable | Display only. |
| access_token_enc | text | Encrypted. |
| refresh_token_enc | text nullable | Encrypted if present. |
| token_expires_at | text datetime nullable | Required if expiring tokens. |
| scopes | text JSON | Granted scopes. |
| status | text | `installed`, `needs_reauth`, `revoked`. |
| created_at | text datetime | ISO 8601. |
| updated_at | text datetime | ISO 8601. |

Unique constraint:

```text
(agent_id, linear_organization_id)
```

### agent_sessions

Maps Linear sessions/issues to Hermes sessions.

| Column | Type | Notes |
| --- | --- | --- |
| id | text primary key | UUID/cuid. |
| agent_id | text | FK agents.id. |
| linear_organization_id | text | Workspace. |
| linear_agent_session_id | text nullable | Preferred for AgentSessionEvent. |
| linear_issue_id | text nullable | Fallback/session context. |
| linear_comment_id | text nullable | Optional thread starter. |
| hermes_session_key | text | Connector-specific session reference. |
| state | text | `active`, `awaiting_input`, `complete`, `error`, `stale`. |
| last_activity_at | text datetime | ISO 8601. |
| created_at | text datetime | ISO 8601. |
| updated_at | text datetime | ISO 8601. |

Suggested unique indexes:

```text
(agent_id, linear_organization_id, linear_agent_session_id)
(agent_id, linear_organization_id, linear_issue_id)
```

### webhook_deliveries

Idempotency and audit trail for incoming Linear webhooks.

| Column | Type | Notes |
| --- | --- | --- |
| id | text primary key | Internal ID. |
| agent_id | text | FK agents.id. |
| provider_delivery_id | text nullable | Linear delivery ID if available. |
| payload_hash | text | SHA-256 of raw body. |
| event_type | text | Normalized type. |
| linear_organization_id | text nullable | Workspace if known. |
| received_at | text datetime | ISO 8601. |
| status | text | `accepted`, `ignored`, `duplicate`, `invalid`, `failed`. |

Unique index:

```text
(agent_id, provider_delivery_id)
```

If Linear does not provide a delivery ID in some payloads, use `payload_hash` plus a time window.

### agent_run_jobs

Durable queued Agent Run Jobs created from accepted webhooks. This table is the MVP Agent Run Queue.

| Column | Type | Notes |
| --- | --- | --- |
| id | text primary key | UUID/cuid. |
| agent_id | text | FK agents.id. |
| agent_session_id | text nullable | FK agent_sessions.id. |
| webhook_delivery_id | text nullable | FK webhook_deliveries.id. |
| dedupe_key | text unique | Stable key from delivery/session/prompt to prevent duplicate Hermes runs. |
| trigger_type | text | `agent_session_created`, `agent_session_prompted`, `mention`, `delegation`. |
| status | text | `queued`, `claimed`, `running`, `awaiting_input`, `succeeded`, `failed`, `canceled`, `retrying`. |
| priority | integer | Higher value runs first; default `0`. |
| scheduled_at | text datetime | Earliest time this job may be claimed. |
| claimed_by | text nullable | Worker Process / runner host id, when claimed. |
| claimed_at | text datetime nullable | Claim timestamp. |
| input | text JSON | Non-secret normalized trigger/context summary. |
| output | text JSON nullable | Non-secret final result summary. |
| error | text nullable | Redacted latest error. |
| max_attempts | integer | Default `3`. |
| created_at | text datetime | ISO 8601. |
| updated_at | text datetime | ISO 8601. |

Indexes:

```text
(status, scheduled_at, priority)
(agent_id, status)
(agent_session_id, created_at)
```

### run_attempts

One Agent Runner execution attempt for an Agent Run Job.

| Column | Type | Notes |
| --- | --- | --- |
| id | text primary key | UUID/cuid. |
| agent_run_job_id | text | FK agent_run_jobs.id. |
| agent_id | text | FK agents.id for easier querying. |
| agent_session_id | text nullable | FK agent_sessions.id. |
| attempt_number | integer | Starts at `1`. |
| runner_id | text nullable | Agent Runner instance id. |
| worker_id | text nullable | Deployment host/process id, if distinct. |
| status | text | `starting`, `running`, `awaiting_input`, `succeeded`, `failed`, `canceled`, `timed_out`. |
| hermes_session_key | text nullable | Session started/resumed by the connector. |
| started_at | text datetime | ISO 8601. |
| heartbeat_at | text datetime nullable | Updated while running. |
| ended_at | text datetime nullable | ISO 8601. |
| result | text JSON nullable | Non-secret runner result. |
| error | text nullable | Redacted error details. |

Unique constraint:

```text
(agent_run_job_id, attempt_number)
```

### runner_events

Structured Agent Runner progress and lifecycle events.

| Column | Type | Notes |
| --- | --- | --- |
| id | text primary key | UUID/cuid. |
| run_attempt_id | text | FK run_attempts.id. |
| agent_run_job_id | text | FK agent_run_jobs.id. |
| agent_session_id | text nullable | FK agent_sessions.id. |
| event_type | text | `claimed`, `context_loaded`, `prompt_built`, `hermes_started`, `progress`, `approval_required`, `linear_response_posted`, `completed`, `failed`. |
| sequence | integer | Monotonic per attempt. |
| payload | text JSON | Redacted event payload. |
| created_at | text datetime | ISO 8601. |

## Configuration JSON examples

### hermes_connector_config for localWebhook

```json
{
  "url": "http://host.docker.internal:8644/webhooks/linear-agent",
  "hmacSecretRef": "encrypted-field",
  "timeoutMs": 120000,
  "deliverMode": "awaitResponse"
}
```

### hermes_connector_config for cli

```json
{
  "command": "hermes",
  "args": ["chat", "-q"],
  "profile": "pm-agent",
  "timeoutMs": 300000,
  "workingDirectory": "/workspace"
}
```

### permission_policy

```json
{
  "autoAllowed": ["summarize", "plan", "comment", "ask_clarifying_question"],
  "requiresApproval": ["code_change", "create_pr", "change_issue_status"],
  "forbidden": ["merge", "deploy", "delete_data", "rotate_credentials"],
  "defaultMode": "plan-only"
}
```

## Migration policy

MVP should include simple forward migrations:

```bash
pnpm db:migrate
```

Rules:

- Never drop columns without a migration note.
- Never log decrypted secrets during migrations.
- Keep SQLite backups before destructive migrations.
