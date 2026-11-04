ALTER TABLE `occupations` ADD `series_id` text;--> statement-breakpoint
CREATE INDEX `occupations_series_idx` ON `occupations` (`series_id`,`starts_at`);