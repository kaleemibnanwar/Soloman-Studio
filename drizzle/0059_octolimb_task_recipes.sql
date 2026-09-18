CREATE TABLE `octolimb_task_recipes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`fingerprint` text NOT NULL,
	`domain` text NOT NULL,
	`instruction` text NOT NULL,
	`steps` text NOT NULL,
	`success_count` integer DEFAULT 0 NOT NULL,
	`failure_count` integer DEFAULT 0 NOT NULL,
	`last_used_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX `octolimb_task_recipes_fingerprint_idx` ON `octolimb_task_recipes` (`fingerprint`);
