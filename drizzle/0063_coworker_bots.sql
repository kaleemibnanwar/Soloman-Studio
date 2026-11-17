ALTER TABLE `tasks` ADD `bot_type` text DEFAULT 'custom' NOT NULL;
--> statement-breakpoint
ALTER TABLE `tasks` ADD `role` text DEFAULT 'executor' NOT NULL;
--> statement-breakpoint
ALTER TABLE `tasks` ADD `last_status` text DEFAULT 'idle' NOT NULL;
--> statement-breakpoint
ALTER TABLE `tasks` ADD `last_result_summary` text;
