ALTER TABLE `import_batches` ADD `supersedes_batch_id` text;--> statement-breakpoint
ALTER TABLE `import_rows` ADD `change_kind` text;--> statement-breakpoint
ALTER TABLE `occupations` ADD `cancel_reason` text;--> statement-breakpoint
ALTER TABLE `occupations` ADD `cancelled_at` text;