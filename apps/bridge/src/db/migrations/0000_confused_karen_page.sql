CREATE TABLE `agent_run_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`agent_session_id` text,
	`webhook_delivery_id` text,
	`dedupe_key` text NOT NULL,
	`trigger_type` text NOT NULL,
	`status` text NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`scheduled_at` text NOT NULL,
	`claimed_by` text,
	`claimed_at` text,
	`cancel_requested_at` text,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`input` text NOT NULL,
	`output` text,
	`error` text,
	`max_attempts` integer DEFAULT 3 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_run_jobs_dedupe_key_unique` ON `agent_run_jobs` (`dedupe_key`);--> statement-breakpoint
CREATE INDEX `ix_jobs_claim` ON `agent_run_jobs` (`status`,`priority`,`scheduled_at`);--> statement-breakpoint
CREATE INDEX `ix_jobs_agent_status` ON `agent_run_jobs` (`agent_id`,`status`);--> statement-breakpoint
CREATE INDEX `ix_jobs_session` ON `agent_run_jobs` (`agent_session_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `agent_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`linear_organization_id` text NOT NULL,
	`linear_agent_session_id` text,
	`linear_issue_id` text,
	`linear_comment_id` text,
	`hermes_session_key` text NOT NULL,
	`state` text NOT NULL,
	`last_activity_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_sessions_agent_org_session` ON `agent_sessions` (`agent_id`,`linear_organization_id`,`linear_agent_session_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `ux_sessions_agent_org_issue` ON `agent_sessions` (`agent_id`,`linear_organization_id`,`linear_issue_id`);--> statement-breakpoint
CREATE TABLE `agents` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`display_name` text NOT NULL,
	`description` text,
	`icon_url` text,
	`enabled` integer DEFAULT true NOT NULL,
	`linear_client_id` text NOT NULL,
	`linear_client_secret_enc` text NOT NULL,
	`linear_webhook_secret_enc` text NOT NULL,
	`required_scopes` text NOT NULL,
	`hermes_connector_type` text NOT NULL,
	`hermes_connector_config_enc` text NOT NULL,
	`permission_policy` text NOT NULL,
	`max_concurrent_runs` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agents_slug_unique` ON `agents` (`slug`);--> statement-breakpoint
CREATE TABLE `linear_installations` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`linear_organization_id` text NOT NULL,
	`linear_organization_name` text,
	`access_token_enc` text NOT NULL,
	`refresh_token_enc` text,
	`token_expires_at` text,
	`scopes` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_installations_agent_org` ON `linear_installations` (`agent_id`,`linear_organization_id`);--> statement-breakpoint
CREATE TABLE `oauth_states` (
	`state` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`redirect_after` text,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `run_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_run_job_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`agent_session_id` text,
	`attempt_number` integer NOT NULL,
	`runner_id` text,
	`status` text NOT NULL,
	`hermes_session_key` text,
	`started_at` text NOT NULL,
	`heartbeat_at` text,
	`ended_at` text,
	`result` text,
	`error` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_attempts_job_attempt` ON `run_attempts` (`agent_run_job_id`,`attempt_number`);--> statement-breakpoint
CREATE TABLE `runner_events` (
	`id` text PRIMARY KEY NOT NULL,
	`run_attempt_id` text NOT NULL,
	`agent_run_job_id` text NOT NULL,
	`agent_session_id` text,
	`event_type` text NOT NULL,
	`sequence` integer NOT NULL,
	`payload` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ix_runner_events_attempt` ON `runner_events` (`run_attempt_id`,`sequence`);--> statement-breakpoint
CREATE TABLE `webhook_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`provider_delivery_id` text,
	`payload_hash` text NOT NULL,
	`event_type` text NOT NULL,
	`linear_organization_id` text,
	`received_at` text NOT NULL,
	`status` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_deliveries_agent_provider` ON `webhook_deliveries` (`agent_id`,`provider_delivery_id`);