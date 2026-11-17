ALTER TABLE `messages` ADD `input_tokens_used` integer;--> statement-breakpoint
ALTER TABLE `messages` ADD `model_call_count` integer;--> statement-breakpoint
CREATE TABLE `agent_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`parent_task_id` text,
	`chat_id` integer,
	`description` text NOT NULL,
	`role` text NOT NULL,
	`dependencies` text NOT NULL,
	`allowed_files` text,
	`allowed_symbols` text,
	`context_budget` integer NOT NULL,
	`output_budget` integer NOT NULL,
	`execution_budget` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE set null
);--> statement-breakpoint
CREATE TABLE `agent_artifacts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`task_id` text NOT NULL,
	`result` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `agent_tasks`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE TABLE `agent_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`task_id` text,
	`event_type` text NOT NULL,
	`payload` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `agent_tasks`(`id`) ON UPDATE no action ON DELETE set null
);--> statement-breakpoint
CREATE TABLE `agent_locks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`resource` text NOT NULL,
	`agent_id` text NOT NULL,
	`lock_type` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);--> statement-breakpoint
CREATE INDEX `agent_locks_resource_idx` ON `agent_locks` (`resource`);--> statement-breakpoint
CREATE TABLE `agent_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`task_id` text,
	`from_agent_id` text,
	`to_agent_id` text,
	`content` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `agent_tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
