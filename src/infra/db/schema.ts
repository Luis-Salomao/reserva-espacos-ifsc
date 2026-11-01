import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const spaces = sqliteTable("spaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  capacity: integer("capacity"),
  createdAt: text("created_at").notNull(),
});
