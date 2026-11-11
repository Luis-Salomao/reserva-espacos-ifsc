import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** Payload cifrado removido nos estados terminais; demais campos suportam inserção OutboxWrite. */
export const mailOutbox = sqliteTable(
  "mail_outbox",
  {
    id: text("id").primaryKey(),
    payload: text("payload"),
    createdAt: text("created_at").notNull(),
    expiresAt: text("expires_at").notNull(),
    status: text("status", { enum: ["pending", "sending", "sent", "failed", "expired"] })
      .notNull()
      .default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: text("next_attempt_at").notNull().default(""),
    leaseToken: text("lease_token").default(sql`NULL`),
    leaseUntil: text("lease_until").default(sql`NULL`),
    completedAt: text("completed_at").default(sql`NULL`),
  },
  (table) => [
    index("mail_outbox_dispatch_idx").on(table.status, table.nextAttemptAt, table.createdAt),
  ],
);
