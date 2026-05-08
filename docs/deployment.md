# Deployment

## Deployment goal

A homelab user should be able to run the bridge with Docker Compose, expose the bridge through a tunnel, and keep Hermes reachable only over local/private networking.

## MVP Docker Compose shape

```yaml
services:
  bridge:
    image: ghcr.io/hojinzs/linear-hermes-bridge:latest
    restart: unless-stopped
    ports:
      - "127.0.0.1:8787:8787"
    env_file:
      - .env
    volumes:
      - ./data:/data

  # Optional. Many users may already run cloudflared separately.
  cloudflared:
    image: cloudflare/cloudflared:latest
    restart: unless-stopped
    command: tunnel --no-autoupdate run --token ${CLOUDFLARE_TUNNEL_TOKEN}
    depends_on:
      - bridge
```

The bridge binds to localhost by default so that the tunnel/reverse proxy is the only public entry point.

## Required environment variables

```env
# Public URL used in Linear OAuth app settings and webhook config.
PUBLIC_BASE_URL=https://linear-agent.example.com

# Local HTTP bind inside the container.
PORT=8787

# SQLite path inside mounted volume.
DATABASE_URL=file:/data/bridge.db

# Encrypt Linear OAuth tokens and app secrets at rest.
ENCRYPTION_KEY=base64-32-byte-key

# Cookie/session signing for admin UI.
APP_SECRET=long-random-string

# Optional bootstrap admin password for first login.
ADMIN_BOOTSTRAP_PASSWORD=change-me
```

Per-agent Linear credentials are stored through the Web UI rather than global `.env` so multiple agents can coexist.

## Hermes connectivity options

### Option 1. Hermes generic webhook on host

Use when Hermes gateway webhook platform is enabled on the host.

```env
HERMES_DEFAULT_CONNECTOR=localWebhook
HERMES_DEFAULT_WEBHOOK_URL=http://host.docker.internal:8644/webhooks/linear-agent
```

Notes:

- On Linux, `host.docker.internal` may require Compose `extra_hosts`:

```yaml
extra_hosts:
  - "host.docker.internal:host-gateway"
```

- The bridge should sign requests using the Hermes route secret and `X-Webhook-Signature`.
- Hermes stays private because only the bridge container reaches it.

### Option 2. Hermes API server on host

Use if Hermes exposes a local API server adapter.

```env
HERMES_DEFAULT_CONNECTOR=apiServer
HERMES_DEFAULT_API_URL=http://host.docker.internal:8080
```

The API server should bind to localhost/private network only.

### Option 3. Hermes CLI inside bridge container

Use for a simple prototype or when mounting Hermes config into the bridge container.

```env
HERMES_DEFAULT_CONNECTOR=cli
HERMES_CLI_COMMAND=hermes
```

This option is less isolated and should be documented as advanced because it may require mounting `~/.hermes` and host project directories.

## Cloudflare Tunnel setup

One common pattern:

```text
linear-agent.example.com -> http://bridge:8787
```

Cloudflare Tunnel config example:

```yaml
tunnel: <tunnel-id>
credentials-file: /etc/cloudflared/<tunnel-id>.json

ingress:
  - hostname: linear-agent.example.com
    service: http://bridge:8787
  - service: http_status:404
```

Linear app settings then use:

```text
OAuth callback URL: https://linear-agent.example.com/oauth/callback/<agentSlug>
Webhook URL:        https://linear-agent.example.com/webhooks/linear/<agentSlug>
```

## Admin UI setup flow

1. Start Docker Compose.
2. Open `https://linear-agent.example.com` or `http://localhost:8787`.
3. Create the first admin account or use bootstrap password.
4. Create an agent record.
5. Copy generated callback/webhook URLs into a Linear OAuth app.
6. Paste Linear client ID, client secret, and webhook secret into the agent record.
7. Click install URL and approve as Linear workspace admin.
8. Verify installed workspace and granted scopes.
9. Mention the Linear app in an issue to run a smoke test.

## Health checks

Endpoints:

```text
GET /healthz
GET /readyz
GET /api/agents/:slug/status
```

Expected health information:

- database reachable,
- encryption key valid,
- Agent Run Queue and Agent Runner host running,
- public base URL configured,
- per-agent Linear install status,
- per-agent Hermes connector status.

## Backup and restore

Back up:

```bash
docker compose stop bridge
cp ./data/bridge.db ./backups/bridge-$(date +%F).db
docker compose start bridge
```

Restore:

```bash
docker compose stop bridge
cp ./backups/bridge-YYYY-MM-DD.db ./data/bridge.db
docker compose start bridge
```

Keep `ENCRYPTION_KEY` backed up separately. Without it, encrypted tokens cannot be recovered.

## Operational logs

Useful commands:

```bash
docker compose logs -f bridge
docker compose ps
curl http://localhost:8787/healthz
```

Logs must redact:

- access tokens,
- refresh tokens,
- client secrets,
- webhook secrets,
- Hermes secrets,
- Authorization headers.
