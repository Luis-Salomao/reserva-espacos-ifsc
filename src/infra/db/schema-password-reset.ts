import { index, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { users } from "./schema-users";

/** Recuperação ligada à conta; usuários ficam em módulo independente para evitar ciclo. */
export const passwordResets = sqliteTable("password_resets", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  createdAt: text("created_at").notNull(),
  expiresAt: text("expires_at").notNull(),
  consumedAt: text("consumed_at"),
  claimId: text("claim_id").unique(),
});

export const passwordRecoveryRequests = sqliteTable(
  "password_recovery_requests",
  {
    id: text("id").primaryKey(),
    emailHash: text("email_hash").notNull(),
    clientHash: text("client_hash").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("recovery_email_time_idx").on(table.emailHash, table.createdAt),
    index("recovery_client_time_idx").on(table.clientHash, table.createdAt),
  ],
);
