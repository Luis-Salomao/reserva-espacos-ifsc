CREATE TABLE `password_resets` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users` (`id`) ON DELETE CASCADE,
  `token_hash` text NOT NULL UNIQUE,
  `created_at` text NOT NULL,
  `expires_at` text NOT NULL,
  `consumed_at` text,
  `claim_id` text UNIQUE
);
--> statement-breakpoint
CREATE TABLE `password_recovery_requests` (
  `id` text PRIMARY KEY NOT NULL,
  `email_hash` text NOT NULL,
  `client_hash` text NOT NULL,
  `created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `recovery_email_time_idx` ON `password_recovery_requests` (`email_hash`, `created_at`);
--> statement-breakpoint
CREATE INDEX `recovery_client_time_idx` ON `password_recovery_requests` (`client_hash`, `created_at`);
