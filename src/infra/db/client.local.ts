import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { AppDb } from "#/infra/db/client";
import * as schema from "#/infra/db/schema";
import { getEnv } from "#/infra/env";

let cached: AppDb | undefined;

/** Banco local (bun:sqlite). Abre, configura e migra no primeiro uso. */
export function getDb(): AppDb {
  if (cached) return cached;
  const path = getEnv(process.env).DATABASE_PATH;
  if (path === undefined) throw new Error("Variáveis de ambiente inválidas: DATABASE_PATH");
  const sqlite = new Database(path, { create: true });
  sqlite.run("PRAGMA journal_mode = WAL");
  sqlite.run("PRAGMA foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "drizzle" });
  cached = db;
  return db;
}
