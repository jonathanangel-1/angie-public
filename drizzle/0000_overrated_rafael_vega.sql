CREATE TABLE `answers` (
	`session_id` text NOT NULL,
	`question_id` text NOT NULL,
	`answer` text NOT NULL,
	`note` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`session_id`, `question_id`)
);
--> statement-breakpoint
CREATE INDEX `answers_session_idx` ON `answers` (`session_id`);--> statement-breakpoint
CREATE TABLE `blind_ratings` (
	`session_id` text NOT NULL,
	`candidate_id` text NOT NULL,
	`rating` text NOT NULL,
	`reason` text,
	`note` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`session_id`, `candidate_id`)
);
--> statement-breakpoint
CREATE INDEX `blind_ratings_session_idx` ON `blind_ratings` (`session_id`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text NOT NULL,
	`type` text NOT NULL,
	`payload` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `events_session_time_idx` ON `events` (`session_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`participant_name` text NOT NULL,
	`stage` text DEFAULT 'questions' NOT NULL,
	`started_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`completed_at` integer
);
