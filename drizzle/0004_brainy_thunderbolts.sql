ALTER TABLE `import_rows` ADD `weekday` integer;--> statement-breakpoint
CREATE INDEX `occupations_space_ends_idx` ON `occupations` (`space_id`,`ends_at`);