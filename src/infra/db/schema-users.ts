import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** Esquema compartilhado por sessões e recuperação, sem dependência circular. */
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  code: text("code").unique(),
  roles: text("roles").notNull(),
  passwordHash: text("password_hash").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  placeholder: integer("placeholder", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
