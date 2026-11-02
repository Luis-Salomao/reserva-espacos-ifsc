import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { AppDb } from "#/infra/db/client";
import * as schema from "#/infra/db/schema";
import { getEnv } from "#/infra/env";

let cached: AppDb | undefined;
let connection: Database | undefined;

/** Pasta das migrações: MIGRATIONS_DIR (ex.: build Nitro) ou `drizzle/` na raiz do repositório. */
function migrationsFolder(): string {
  return process.env.MIGRATIONS_DIR ?? resolve(import.meta.dirname, "../../../drizzle");
}

/** Banco local (bun:sqlite). Cria a pasta, abre, configura e migra no primeiro uso. */
export function getDb(): AppDb {
  if (cached) return cached;
  const path = getEnv(getRuntimeEnv()).DATABASE_PATH;
  if (path === undefined) throw new Error("Variáveis de ambiente inválidas: DATABASE_PATH");
  if (path !== ":memory:") mkdirSync(dirname(resolve(path)), { recursive: true });
  const sqlite = new Database(path, { create: true });
  sqlite.run("PRAGMA journal_mode = WAL");
  // Chaves estrangeiras ligadas (no SQLite é por conexão). Nenhuma lógica de importação depende delas:
  // apagar rascunho e trocar de estado são condicionais ao estado do lote. No D1, pelo que a
  // documentação da Cloudflare indica, as chaves estrangeiras são sempre aplicadas (NÃO verificado aqui).
  sqlite.run("PRAGMA foreign_keys = ON");
  connection = sqlite;
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: migrationsFolder() });
  cached = db;
  return db;
}

/** Apenas para testes: fecha e descarta a conexão em cache. */
export function resetDbCache(): void {
  connection?.close(true);
  connection = undefined;
  cached = undefined;
}

/**
 * Fonte das variáveis de ambiente neste alvo: o processo Bun. Como este módulo só existe no
 * alvo local, DEPLOY_TARGET assume "local"; DATABASE_PATH é obrigatória e não tem padrão
 * (`getEnv` falha nomeando a variável quando ela falta).
 */
export function getRuntimeEnv(): Record<string, string | undefined> {
  return { ...process.env, DEPLOY_TARGET: process.env.DEPLOY_TARGET || "local" };
}
