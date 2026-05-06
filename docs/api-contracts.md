# API Contracts

This document defines the MVP HTTP surface. It is intentionally route-level rather than framework-specific.

## Public routes

### GET /healthz

Purpose: liveness check.

Response 200:

```json
{
  "ok": true,
  "service": "linear-hermes-bridge",
  "version": "0.0.0"
}
```

No secrets or per-agent status should be returned here.

### GET /readyz

Purpose: readiness check for local operator/tunnel health.

Response 200:

```json
{
  "ok": true,
  "database": "ok",
  "worker": "ok"
}
```

Response 503 when database or worker is unavailable.

### GET /oauth/authorize/:agentSlug

Purpose: start Linear OAuth installation for one configured agent.

Behavior:

1. Verify agent exists and is enabled.
2. Generate and store OAuth `state`.
3. Redirect to Linear OAuth authorize URL.

Redirect URL must include:

```text
client_id=<agent linear client id>
redirect_uri=<PUBLIC_BASE_URL>/oauth/callback/<agentSlug>
response_type=code
scope=<agent required scopes>
state=<random state>
actor=app
```

### GET /oauth/callback/:agentSlug

Purpose: receive Linear OAuth callback.

Query parameters:

| Name | Required | Notes |
| --- | --- | --- |
| code | yes | Authorization code. |
| state | yes | Must match stored OAuth state. |
| error | no | Linear authorization error. |

Success response 200:

```json
{
  "ok": true,
  "agentSlug": "pm-agent",
  "status": "installed"
}
```

Failure responses:

- 400 missing code/state.
- 400 invalid state.
- 502 token exchange failed.

### POST /webhooks/linear/:agentSlug

Purpose: receive Linear webhooks for one agent.

Required header:

```text
linear-signature: <hmac-sha256-hex>
```

Behavior:

1. Resolve agent by slug.
2. Read raw body.
3. Verify HMAC with the agent webhook secret.
4. Parse payload.
5. Normalize event.
6. Deduplicate delivery.
7. Enqueue job.
8. Return quickly.

Accepted response 202:

```json
{
  "ok": true,
  "status": "accepted",
  "jobId": "job_..."
}
```

Ignored response 200:

```json
{
  "ok": true,
  "status": "ignored",
  "reason": "unsupported_event"
}
```

Failure responses:

- 401 invalid signature.
- 404 unknown agent.
- 413 body too large.
- 429 rate limited.

## Admin API routes

Admin routes require authenticated admin session.

### GET /api/agents

Response:

```json
{
  "agents": [
    {
      "slug": "pm-agent",
      "displayName": "PM Agent",
      "enabled": true,
      "installedOrganizations": 1,
      "hermesConnectorType": "localWebhook"
    }
  ]
}
```

### POST /api/agents

Request:

```json
{
  "slug": "pm-agent",
  "displayName": "PM Agent",
  "description": "Planning and requirement analysis",
  "linearClientId": "lin_oauth_...",
  "linearClientSecret": "secret entered once",
  "linearWebhookSecret": "secret entered once",
  "requiredScopes": ["read", "comments:create", "app:mentionable", "app:assignable"],
  "hermesConnectorType": "localWebhook",
  "hermesConnectorConfig": {
    "url": "http://host.docker.internal:8644/webhooks/pm-agent",
    "hmacSecret": "hermes route secret"
  },
  "permissionPolicy": {
    "defaultMode": "plan-only"
  }
}
```

Response 201:

```json
{
  "agent": {
    "slug": "pm-agent",
    "callbackUrl": "https://linear-agent.example.com/oauth/callback/pm-agent",
    "webhookUrl": "https://linear-agent.example.com/webhooks/linear/pm-agent",
    "installUrl": "https://linear-agent.example.com/oauth/authorize/pm-agent"
  }
}
```

### GET /api/agents/:agentSlug

Returns public and operational details, never decrypted secrets.

### PATCH /api/agents/:agentSlug

Allows updating display metadata, connector config, policy, and rotating secrets. Secret fields are write-only.

### POST /api/agents/:agentSlug/test-hermes

Purpose: verify bridge can reach the configured local Hermes target.

Response:

```json
{
  "ok": true,
  "latencyMs": 120,
  "connectorType": "localWebhook"
}
```

### POST /api/agents/:agentSlug/enable

Enables routing for the agent.

### POST /api/agents/:agentSlug/disable

Disables routing for the agent while preserving config and installations.

## Internal job payload

Normalized job input:

```json
{
  "agentId": "agt_...",
  "trigger": {
    "type": "agent_session_created",
    "linearOrganizationId": "org_...",
    "linearAgentSessionId": "session_...",
    "linearIssueId": "issue_...",
    "linearCommentId": "comment_...",
    "userInstruction": "Summarize and plan this issue",
    "issue": {
      "identifier": "ENG-123",
      "title": "Example issue",
      "url": "https://linear.app/..."
    }
  }
}
```

## Versioning

- Public webhook/OAuth routes are stable within major versions.
- Admin API should use `/api` with explicit response schemas.
- If Agent Activity support adds new routes, keep comment response as fallback.
