# Security Model

## Security goal

Expose only the minimum public surface required for Linear OAuth, Linear webhooks, and optional Web UI. Keep Hermes local-only. Store Linear and Hermes credentials encrypted. Make potentially destructive agent actions require human approval.

## Trust boundaries

```text
Untrusted public internet
  -> Tunnel/reverse proxy
  -> Bridge public endpoints
  -> Bridge private storage/job worker
  -> Local Hermes endpoint/CLI
```

Hermes is inside the private boundary. Linear and browsers never call Hermes directly.

## Public endpoints

| Endpoint | Public? | Protection |
| --- | --- | --- |
| `/oauth/authorize/:agentSlug` | Yes | Agent exists, state generated. |
| `/oauth/callback/:agentSlug` | Yes | OAuth state verification. |
| `/webhooks/linear/:agentSlug` | Yes | Raw body HMAC via `linear-signature`. |
| `/` Admin UI | Optional | Login/session auth; optionally restrict by tunnel access policy. |
| `/healthz` | Optional | No secrets; minimal output. |

## Linear webhook verification

Linear webhook receiver must:

1. Read the raw request body before parsing JSON.
2. Compute HMAC-SHA256 using the agent's Linear webhook secret.
3. Compare against the `linear-signature` header using constant-time comparison.
4. Reject invalid signatures before enqueueing jobs.

Pseudo-code:

```ts
const expected = hmacSha256Hex(webhookSecret, rawBody);
if (!timingSafeEqual(expected, request.headers.get("linear-signature"))) {
  return response.status(401).json({ error: "invalid signature" });
}
```

## OAuth state

- Generate at least 32 random bytes per OAuth flow.
- Store with a short TTL.
- Verify returned `state` exactly.
- Delete state after use.
- Do not accept callback without state.

## Token storage

Encrypted fields:

- `linear_client_secret_enc`,
- `linear_webhook_secret_enc`,
- `access_token_enc`,
- `refresh_token_enc`,
- `hermes_connector_config_enc` when it contains secrets.

MVP encryption:

- AES-256-GCM.
- 32-byte `ENCRYPTION_KEY` supplied via `.env`.
- Random nonce per value.
- Auth tag stored with ciphertext.

Do not log decrypted values.

## Admin authentication

MVP options:

1. Local admin account with password hash.
2. Bootstrap password only for first account creation.
3. Optional Cloudflare Access in front of the Web UI.

The Web UI should not be required for webhook execution once agents are configured.

## Permission policy

Default policy should be conservative.

### Auto-allowed

- Summarize issue/comment context.
- Ask clarifying questions.
- Draft implementation plans.
- Post comments.
- Generate checklists.

### Requires approval

- Modify code.
- Create PR.
- Change Linear issue status.
- Create/update external tickets.
- Run commands outside an allowlisted project directory.

### Forbidden by default

- Merge PR.
- Deploy to production.
- Delete data.
- Rotate credentials.
- Expose secrets.
- Run destructive shell commands.

## Prompt injection concerns

Linear issue content is untrusted user input. The bridge prompt envelope must clearly separate:

- system/bridge policy,
- Linear context,
- user instruction,
- quoted issue/comment content.

The bridge should tell Hermes that Linear content may contain malicious instructions and that bridge policy wins.

## Rate limiting and idempotency

Webhook endpoint should include:

- per-agent rate limits,
- request body size limit,
- idempotency using delivery ID or payload hash,
- retry-safe job creation.

## Secret redaction

Redact from logs and UI audit views:

- `Authorization`,
- `client_secret`,
- `access_token`,
- `refresh_token`,
- `webhook_secret`,
- `ENCRYPTION_KEY`,
- Hermes API keys/secrets.

## Open security questions

- Should the admin UI be enabled by default or opt-in behind Cloudflare Access?
- Should PR creation require a second approval even if the Linear user explicitly requested it?
- Should the bridge support per-agent workspace/team allowlists in MVP?
- Should CLI connector be disabled by default because it has broader local access?
