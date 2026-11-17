CREATE TABLE `drive_account` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text,
	`refresh_token_encrypted` text NOT NULL,
	`access_token_encrypted` text,
	`access_token_expires_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);--> statement-breakpoint
ALTER TABLE `apps` ADD `google_drive_sync_enabled` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `apps` ADD `google_drive_folder_id` text;--> statement-breakpoint
ALTER TABLE `apps` ADD `google_drive_folder_name` text;--> statement-breakpoint
ALTER TABLE `apps` ADD `google_drive_last_synced_at` integer;
