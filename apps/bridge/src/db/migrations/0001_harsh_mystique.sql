CREATE TABLE `agent_workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`linear_organization_id` text NOT NULL,
	`linear_issue_id` text NOT NULL,
	`issue_identifier` text NOT NULL,
	`workspace_path` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`last_used_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_agent_workspaces_issue` ON `agent_workspaces` (`agent_id`,`linear_organization_id`,`linear_issue_id`);--> statement-breakpoint
ALTER TABLE `run_attempts` ADD `workspace_path` text;