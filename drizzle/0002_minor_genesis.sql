CREATE TABLE `semester_blocks` (
	`semester_id` text NOT NULL,
	`number` integer NOT NULL,
	`name` text NOT NULL,
	`short` text NOT NULL,
	`start_time` text NOT NULL,
	`end_time` text NOT NULL,
	PRIMARY KEY(`semester_id`, `number`),
	FOREIGN KEY (`semester_id`) REFERENCES `semesters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `semester_terms` (
	`semester_id` text NOT NULL,
	`position` integer NOT NULL,
	`starts_on` text NOT NULL,
	`ends_on` text NOT NULL,
	PRIMARY KEY(`semester_id`, `position`),
	FOREIGN KEY (`semester_id`) REFERENCES `semesters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `semesters` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`starts_on` text NOT NULL,
	`ends_on` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `semesters_name_unique` ON `semesters` (`name`);