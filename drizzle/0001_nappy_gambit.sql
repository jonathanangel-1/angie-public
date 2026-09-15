CREATE TABLE `ranking_freezes` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`version` text NOT NULL,
	`created_at` integer NOT NULL,
	`answers_json` text NOT NULL,
	`baseline_json` text NOT NULL,
	`adjusted_json` text NOT NULL,
	`audit_json` text NOT NULL,
	`integrity_hash` text NOT NULL,
	`blind_labels_seen` integer DEFAULT 0 NOT NULL
);
