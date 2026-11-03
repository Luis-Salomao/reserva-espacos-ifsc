ALTER TABLE `occupations` ADD `created_by` text REFERENCES users(id);--> statement-breakpoint
CREATE INDEX `occupations_created_by_idx` ON `occupations` (`created_by`,`starts_at`);--> statement-breakpoint
CREATE INDEX `occupations_responsible_idx` ON `occupations` (`responsible_user_id`,`starts_at`);