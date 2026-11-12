CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`actor_id` text,
	`occupation_id` text,
	`request_id` text,
	`data_json` text NOT NULL,
	`created_at` text NOT NULL,
	`read_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `notifications_user_idx` ON `notifications` (`user_id`,`read_at`,`created_at`);--> statement-breakpoint
CREATE TABLE `room_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`occupation_id` text NOT NULL,
	`requester_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`purpose` text NOT NULL,
	`message` text,
	`status` text NOT NULL,
	`decision_note` text,
	`created_at` text NOT NULL,
	`decided_at` text,
	`new_occupation_id` text,
	FOREIGN KEY (`requester_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `room_requests_owner_idx` ON `room_requests` (`owner_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `room_requests_requester_idx` ON `room_requests` (`requester_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `room_requests_pending_unique` ON `room_requests` (`occupation_id`,`requester_id`) WHERE "room_requests"."status" = 'pendente';