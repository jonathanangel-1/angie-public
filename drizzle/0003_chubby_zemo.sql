CREATE TABLE `inspiration_feedback` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text NOT NULL,
	`recommendation_id` text NOT NULL,
	`edit_id` text NOT NULL,
	`reaction` text NOT NULL,
	`target_item_ids_json` text NOT NULL,
	`note` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `inspiration_feedback_session_recommendation_time_idx` ON `inspiration_feedback` (`session_id`,`recommendation_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `inspiration_recommendations` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`storage_key` text NOT NULL,
	`image_type` text NOT NULL,
	`image_hash` text NOT NULL,
	`note` text,
	`style_brief_json` text NOT NULL,
	`edits_json` text NOT NULL,
	`sources_json` text NOT NULL,
	`model` text NOT NULL,
	`search_mode` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `inspiration_recommendations_session_time_idx` ON `inspiration_recommendations` (`session_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `preference_signals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text NOT NULL,
	`recommendation_id` text NOT NULL,
	`feature_type` text NOT NULL,
	`feature_value` text NOT NULL,
	`weight_delta` real NOT NULL,
	`reaction` text NOT NULL,
	`target_item_id` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `preference_signals_session_feature_idx` ON `preference_signals` (`session_id`,`feature_type`,`feature_value`);