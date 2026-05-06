# Linear Setup Guide

This guide describes the manual Linear setup expected for MVP. Automatic Linear OAuth app creation is a non-goal until Linear exposes a stable API for that workflow.

## Prerequisites

- You are a Linear workspace admin.
- The bridge is running locally or in Docker.
- A public HTTPS URL points to the bridge through Cloudflare Tunnel or equivalent.

Example public URL:

```text
https://linear-agent.example.com
```

## Step 1. Create an agent record in the bridge

In the bridge Admin UI:

1. Click **New agent**.
2. Choose a slug, e.g. `pm-agent`.
3. Choose a display name, e.g. `PM Agent`.
4. Select Hermes connector type.
5. Save.

The UI displays:

```text
OAuth callback URL: https://linear-agent.example.com/oauth/callback/pm-agent
Webhook URL:        https://linear-agent.example.com/webhooks/linear/pm-agent
Install URL:        https://linear-agent.example.com/oauth/authorize/pm-agent
```

## Step 2. Create Linear OAuth app

In Linear:

1. Open Settings → Administration → API / Applications.
2. Create a new OAuth application.
3. Set the application name and icon. These are what users see in mention menus.
4. Set the OAuth callback URL from the bridge UI.
5. Enable webhooks.
6. Set the webhook URL from the bridge UI.
7. Enable Agent session events if available.
8. Copy the Client ID, Client Secret, and Webhook Secret.

## Step 3. Configure the agent record

Paste into the bridge Admin UI:

- Linear Client ID,
- Linear Client Secret,
- Linear Webhook Secret,
- Required scopes.

Recommended MVP scopes:

```text
read comments:create app:mentionable app:assignable
```

Add only if needed:

```text
write issues:create
```

Do not request `admin` for `actor=app` agent installs.

## Step 4. Install app into Linear workspace

Open the bridge-generated install URL. It redirects to Linear OAuth with:

```text
actor=app
```

A workspace admin approves the install.

After callback, the bridge should show:

```text
Status: installed
Workspace: <Linear organization>
Scopes: <granted scopes>
```

## Step 5. Smoke test

In a Linear issue, mention the app:

```md
@PM Agent Please summarize this issue and propose a short implementation plan. Do not create a PR yet.
```

Expected behavior:

1. Linear sends webhook to the bridge.
2. Bridge verifies signature and queues a Hermes job.
3. Hermes receives prompt locally.
4. Bridge posts a comment back to the Linear issue.

## Troubleshooting

### Linear does not call the webhook

Check:

- Public URL is HTTPS.
- Tunnel routes to bridge port.
- Webhook URL path includes the right `agentSlug`.
- Webhooks are enabled in the Linear OAuth app.
- Agent session events or app notifications are selected.

### Webhook returns invalid signature

Check:

- The agent record has the correct Linear webhook secret.
- The bridge verifies the raw request body, not re-serialized JSON.
- The request contains `linear-signature`.

### App does not appear in mention menu

Check:

- OAuth install used `actor=app`.
- Scope includes `app:mentionable`.
- Workspace admin approved the app.
- The app has access to the relevant team.

### Delegation does not work

Check:

- Scope includes `app:assignable`.
- The app has access to the relevant team/project.
- Linear's agent/delegate UI is enabled for the workspace.
