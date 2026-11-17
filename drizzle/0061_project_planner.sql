CREATE TABLE `planner_tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`app_id` integer,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'todo' NOT NULL,
	`priority` text DEFAULT 'medium' NOT NULL,
	`due_at` integer,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `planner_tasks_app_status_position_idx` ON `planner_tasks` (`app_id`,`status`,`position`);
--> statement-breakpoint
CREATE INDEX `planner_tasks_due_at_idx` ON `planner_tasks` (`due_at`);
