CREATE TABLE `mail_outbox` (
  `id` text PRIMARY KEY NOT NULL,
  `payload` text,
  `created_at` text NOT NULL,
  `expires_at` text NOT NULL,
  `status` text DEFAULT 'pending' NOT NULL,
  `attempts` integer DEFAULT 0 NOT NULL,
  `next_attempt_at` text DEFAULT '' NOT NULL,
  `lease_token` text DEFAULT NULL,
  `lease_until` text DEFAULT NULL,
  `completed_at` text DEFAULT NULL
);
--> statement-breakpoint
CREATE INDEX `mail_outbox_dispatch_idx` ON `mail_outbox` (`status`, `next_attempt_at`, `created_at`);
