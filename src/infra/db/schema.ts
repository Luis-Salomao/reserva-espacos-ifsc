import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

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

export const semesters = sqliteTable("semesters", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  startsOn: text("starts_on").notNull(),
  endsOn: text("ends_on").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const semesterTerms = sqliteTable(
  "semester_terms",
  {
    semesterId: text("semester_id")
      .notNull()
      .references(() => semesters.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    startsOn: text("starts_on").notNull(),
    endsOn: text("ends_on").notNull(),
  },
  (table) => [primaryKey({ columns: [table.semesterId, table.position] })],
);

export const semesterBlocks = sqliteTable(
  "semester_blocks",
  {
    semesterId: text("semester_id")
      .notNull()
      .references(() => semesters.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    name: text("name").notNull(),
    short: text("short").notNull(),
    startTime: text("start_time").notNull(),
    endTime: text("end_time").notNull(),
  },
  (table) => [primaryKey({ columns: [table.semesterId, table.number] })],
);
