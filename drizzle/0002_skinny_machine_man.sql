CREATE TABLE `stylist_feedback` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text NOT NULL,
	`request` text NOT NULL,
	`look_id` text NOT NULL,
	`reaction` text NOT NULL,
	`item_ids_json` text NOT NULL,
	`target_item_ids_json` text NOT NULL,
	`note` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `stylist_feedback_session_time_idx` ON `stylist_feedback` (`session_id`,`created_at`);