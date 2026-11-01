import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import type * as schema from "#/infra/db/schema";

/** Tipo comum aceito pelos dois drivers (bun-sqlite "sync" e d1 "async"). */
export type AppDb = BaseSQLiteDatabase<"async" | "sync", unknown, typeof schema>;
