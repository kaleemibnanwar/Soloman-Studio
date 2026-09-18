CREATE TABLE `worker_planning` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`enabled` integer DEFAULT 0 NOT NULL,
	`cadence` text DEFAULT 'weekly' NOT NULL,
	`last_planned_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE UNIQUE INDEX `worker_planning_project_idx` ON `worker_planning` (`project_id`);
