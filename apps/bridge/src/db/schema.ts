import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const agents = sqliteTable("agents", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  displayName: text("display_name").notNull(),
  description: text("description"),
  iconUrl: text("icon_url"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  linearClientId: text("linear_client_id").notNull(),
  linearClientSecretEnc: text("linear_client_secret_enc").notNull(),
  linearWebhookSecretEnc: text("linear_webhook_secret_enc").notNull(),
  requiredScopes: text("required_scopes", { mode: "json" }).$type<string[]>().notNull(),
  hermesConnectorType: text("hermes_connector_type").notNull(),
  hermesConnectorConfigEnc: text("hermes_connector_config_enc").notNull(),
  permissionPolicy: text("permission_policy", { mode: "json" }).$type<unknown>().notNull(),
  maxConcurrentRuns: integer("max_concurrent_runs").notNull().default(1),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const oauthStates = sqliteTable("oauth_states", {
  state: text("state").primaryKey(),
  agentId: text("agent_id").notNull(),
  redirectAfter: text("redirect_after"),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull(),
});

export const linearInstallations = sqliteTable(
  "linear_installations",
  {
    id: text("id").primaryKey(),
    agentId: text("agent_id").notNull(),
    linearOrganizationId: text("linear_organization_id").notNull(),
    linearOrganizationName: text("linear_organization_name"),
    accessTokenEnc: text("access_token_enc").notNull(),
    refreshTokenEnc: text("refresh_token_enc"),
    tokenExpiresAt: text("token_expires_at"),
    scopes: text("scopes", { mode: "json" }).$type<string[]>().notNull(),
    status: text("status").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => ({
    uxAgentOrg: uniqueIndex("ux_installations_agent_org").on(t.agentId, t.linearOrganizationId),
  }),
);

export const agentSessions = sqliteTable(
  "agent_sessions",
  {
    id: text("id").primaryKey(),
    agentId: text("agent_id").notNull(),
    linearOrganizationId: text("linear_organization_id").notNull(),
    linearAgentSessionId: text("linear_agent_session_id"),
    linearIssueId: text("linear_issue_id"),
    linearCommentId: text("linear_comment_id"),
    hermesSessionKey: text("hermes_session_key").notNull(),
    state: text("state").notNull(),
    lastActivityAt: text("last_activity_at").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => ({
    uxSession: uniqueIndex("ux_sessions_agent_org_session").on(
      t.agentId,
      t.linearOrganizationId,
      t.linearAgentSessionId,
    ),
    uxIssue: uniqueIndex("ux_sessions_agent_org_issue").on(
      t.agentId,
      t.linearOrganizationId,
      t.linearIssueId,
    ),
  }),
);

export const webhookDeliveries = sqliteTable(
  "webhook_deliveries",
  {
    id: text("id").primaryKey(),
    agentId: text("agent_id").notNull(),
    providerDeliveryId: text("provider_delivery_id"),
    payloadHash: text("payload_hash").notNull(),
    eventType: text("event_type").notNull(),
    linearOrganizationId: text("linear_organization_id"),
    receivedAt: text("received_at").notNull(),
    status: text("status").notNull(),
  },
  (t) => ({
    uxDelivery: uniqueIndex("ux_deliveries_agent_provider").on(t.agentId, t.providerDeliveryId),
  }),
);

export const agentRunJobs = sqliteTable(
  "agent_run_jobs",
  {
    id: text("id").primaryKey(),
    agentId: text("agent_id").notNull(),
    agentSessionId: text("agent_session_id"),
    webhookDeliveryId: text("webhook_delivery_id"),
    dedupeKey: text("dedupe_key").notNull().unique(),
    triggerType: text("trigger_type").notNull(),
    status: text("status").notNull(),
    priority: integer("priority").notNull().default(0),
    scheduledAt: text("scheduled_at").notNull(),
    claimedBy: text("claimed_by"),
    claimedAt: text("claimed_at"),
    cancelRequestedAt: text("cancel_requested_at"),
    attemptCount: integer("attempt_count").notNull().default(0),
    input: text("input", { mode: "json" }).$type<unknown>().notNull(),
    output: text("output", { mode: "json" }).$type<unknown>(),
    error: text("error"),
    maxAttempts: integer("max_attempts").notNull().default(3),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => ({
    ixClaimScan: index("ix_jobs_claim").on(t.status, t.priority, t.scheduledAt),
    ixAgentStatus: index("ix_jobs_agent_status").on(t.agentId, t.status),
    ixSession: index("ix_jobs_session").on(t.agentSessionId, t.createdAt),
  }),
);

export const runAttempts = sqliteTable(
  "run_attempts",
  {
    id: text("id").primaryKey(),
    agentRunJobId: text("agent_run_job_id").notNull(),
    agentId: text("agent_id").notNull(),
    agentSessionId: text("agent_session_id"),
    attemptNumber: integer("attempt_number").notNull(),
    runnerId: text("runner_id"),
    status: text("status").notNull(),
    hermesSessionKey: text("hermes_session_key"),
    startedAt: text("started_at").notNull(),
    heartbeatAt: text("heartbeat_at"),
    endedAt: text("ended_at"),
    result: text("result", { mode: "json" }).$type<unknown>(),
    error: text("error"),
  },
  (t) => ({
    uxJobAttempt: uniqueIndex("ux_attempts_job_attempt").on(t.agentRunJobId, t.attemptNumber),
  }),
);

export const runnerEvents = sqliteTable(
  "runner_events",
  {
    id: text("id").primaryKey(),
    runAttemptId: text("run_attempt_id").notNull(),
    agentRunJobId: text("agent_run_job_id").notNull(),
    agentSessionId: text("agent_session_id"),
    eventType: text("event_type").notNull(),
    sequence: integer("sequence").notNull(),
    payload: text("payload", { mode: "json" }).$type<unknown>().notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => ({
    ixAttempt: index("ix_runner_events_attempt").on(t.runAttemptId, t.sequence),
  }),
);
