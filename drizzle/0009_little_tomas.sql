CREATE TABLE `space_equipment` (
	`space_id` text NOT NULL,
	`kind` text NOT NULL,
	`quantity` integer NOT NULL,
	PRIMARY KEY(`space_id`, `kind`),
	FOREIGN KEY (`space_id`) REFERENCES `spaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `spaces` ADD `equipment_notes` text;