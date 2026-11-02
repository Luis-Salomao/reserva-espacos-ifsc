import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const spaces = sqliteTable("spaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  capacity: integer("capacity"),
  createdAt: text("created_at").notNull(),
});

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  code: text("code").unique(),
  roles: text("roles").notNull(),
  passwordHash: text("password_hash").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  createdAt: text("created_at").notNull(),
  expiresAt: text("expires_at").notNull(),
  lastSeenAt: text("last_seen_at").notNull(),
});

export const loginAttempts = sqliteTable(
  "login_attempts",
  {
    email: text("email").notNull(),
    attemptedAt: text("attempted_at").notNull(),
    success: integer("success", { mode: "boolean" }).notNull(),
  },
  (table) => [index("login_attempts_email_idx").on(table.email, table.attemptedAt)],
);
