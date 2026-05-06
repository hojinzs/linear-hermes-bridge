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
  1 -> many jobs

linear_installations
  many -> 1 agents

agent_sessions
  many -> 1 agents

jobs
  many -> 1 agents
  optional -> 1 agent_sessions
```

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

### jobs

Background processing jobs created from accepted webhooks.

| Column | Type | Notes |
| --- | --- | --- |
| id | text primary key | UUID/cuid. |
| agent_id | text | FK agents.id. |
| agent_session_id | text nullable | FK agent_sessions.id. |
| webhook_delivery_id | text nullable | FK webhook_deliveries.id. |
| type | text | `run_hermes`, `post_linear_response`, `refresh_token`. |
| status | text | `queued`, `running`, `succeeded`, `failed`, `retrying`. |
| attempt_count | integer | Retry counter. |
| input | text JSON | Non-secret job input. |
| output | text JSON nullable | Non-secret result summary. |
| error | text nullable | Redacted error. |
| available_at | text datetime | For retry scheduling. |
| created_at | text datetime | ISO 8601. |
| updated_at | text datetime | ISO 8601. |

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
