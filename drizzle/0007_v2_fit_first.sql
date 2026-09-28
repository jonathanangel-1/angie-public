-- v2 fit-first tables. Additive only: v1 tables and rows are left untouched.
CREATE TABLE IF NOT EXISTS `catalog_products` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`embedder_version` text NOT NULL,
	`data_json` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `catalog_size_charts` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`data_json` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `fit_outcomes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`product_id` text,
	`search_id` text,
	`brand` text NOT NULL,
	`category` text NOT NULL,
	`size` text NOT NULL,
	`result` text NOT NULL,
	`fit` text NOT NULL,
	`area` text,
	`reason` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `fit_outcomes_user_time_idx` ON `fit_outcomes` (`user_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `fit_profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`body_json` text NOT NULL,
	`references_json` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `searches` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`category` text,
	`color_name` text NOT NULL,
	`features_json` text NOT NULL,
	`result_ids_json` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `searches_user_time_idx` ON `searches` (`user_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `users` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL
);
