ALTER TABLE `worker_proposals` ADD `name` text;--> statement-breakpoint
ALTER TABLE `worker_proposals` ADD `steps` text DEFAULT '[]' NOT NULL;
