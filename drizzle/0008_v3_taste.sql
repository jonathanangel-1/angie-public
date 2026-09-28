-- v3 taste tables. Additive only.
CREATE TABLE IF NOT EXISTS `purchases` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`brand` text NOT NULL,
	`title` text NOT NULL,
	`slot` text,
	`size` text NOT NULL,
	`status` text NOT NULL,
	`return_reason` text,
	`price` real,
	`source` text NOT NULL,
	`confidence` real NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `purchases_user_time_idx` ON `purchases` (`user_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `reactions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`brand` text NOT NULL,
	`title` text NOT NULL,
	`features_json` text NOT NULL,
	`reaction` text NOT NULL,
	`reason` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `reactions_user_time_idx` ON `reactions` (`user_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `taste_profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`quiz_json` text NOT NULL,
	`updated_at` integer NOT NULL
);
