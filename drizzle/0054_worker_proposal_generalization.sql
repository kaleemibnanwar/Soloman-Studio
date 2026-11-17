ALTER TABLE `worker_proposals` ADD `type` text DEFAULT 'dev' NOT NULL;--> statement-breakpoint
ALTER TABLE `worker_proposals` ADD `target` text;--> statement-breakpoint
ALTER TABLE `worker_proposals` ADD `tool` text;--> statement-breakpoint
ALTER TABLE `worker_proposals` ADD `execution_run_id` integer REFERENCES `worker_runs`(`id`) ON UPDATE no action ON DELETE set null;--> statement-breakpoint
ALTER TABLE `worker_proposals` ADD `execution_outcome` text;
