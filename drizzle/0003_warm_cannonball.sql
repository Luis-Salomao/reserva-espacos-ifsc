CREATE TABLE `import_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`semester_id` text NOT NULL,
	`file_hash` text NOT NULL,
	`summary_json` text NOT NULL,
	`status` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`applied_at` text,
	FOREIGN KEY (`semester_id`) REFERENCES `semesters`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `import_batches_hash_semester_unique` ON `import_batches` (`file_hash`,`semester_id`);--> statement-breakpoint
CREATE TABLE `import_rows` (
	`batch_id` text NOT NULL,
	`row_key` text NOT NULL,
	`lesson_id` text NOT NULL,
	`space_id` text,
	`date` text,
	`start_time` text NOT NULL,
	`end_time` text NOT NULL,
	`title` text NOT NULL,
	`responsible_user_id` text,
	`status` text NOT NULL,
	`reason_code` text,
	`reason_detail` text,
	`occupation_id` text,
	`conflict_occupation_id` text,
	PRIMARY KEY(`batch_id`, `row_key`),
	FOREIGN KEY (`batch_id`) REFERENCES `import_batches`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `import_rows_batch_status_idx` ON `import_rows` (`batch_id`,`status`);--> statement-breakpoint
CREATE TABLE `occupations` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`starts_at` text NOT NULL,
	`ends_at` text NOT NULL,
	`source` text NOT NULL,
	`batch_id` text,
	`lesson_id` text,
	`responsible_user_id` text,
	`title` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `spaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`batch_id`) REFERENCES `import_batches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`responsible_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `occupations_space_starts_idx` ON `occupations` (`space_id`,`starts_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `occupations_import_unique` ON `occupations` (`batch_id`,`lesson_id`,`space_id`,`starts_at`);--> statement-breakpoint
CREATE TABLE `room_mappings` (
	`source_room_id` text PRIMARY KEY NOT NULL,
	`source_short` text NOT NULL,
	`space_id` text,
	`ignored` integer DEFAULT false NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `spaces`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `teacher_mappings` (
	`source_teacher_id` text PRIMARY KEY NOT NULL,
	`source_short` text NOT NULL,
	`user_id` text,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
