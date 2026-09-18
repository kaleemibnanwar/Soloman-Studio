ALTER TABLE `worker_runs` ADD `mode` text DEFAULT 'execute' NOT NULL;--> statement-breakpoint
CREATE TABLE `worker_proposals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer,
	`run_id` integer,
	`summary` text NOT NULL,
	`rationale` text,
	`scope_files` text DEFAULT '[]' NOT NULL,
	`personas` text DEFAULT '[]' NOT NULL,
	`estimated_tool_calls` integer,
	`status` text DEFAULT 'pending' NOT NULL,
	`feedback` text,
	`guardrail_flags` text DEFAULT '[]' NOT NULL,
	`consensus_diff` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`resolved_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`run_id`) REFERENCES `worker_runs`(`id`) ON UPDATE no action ON DELETE set null
);--> statement-breakpoint
CREATE INDEX `worker_proposals_project_status_idx` ON `worker_proposals` (`project_id`,`status`);
