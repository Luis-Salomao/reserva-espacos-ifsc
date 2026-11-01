import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import type * as schema from "#/infra/db/schema";

/** Tipo comum aceito pelos dois drivers (bun-sqlite "sync" e d1 "async"). */
export type AppDb = BaseSQLiteDatabase<"async" | "sync", unknown, typeof schema>;

/** Contrato que `client.local.ts` e `client.cloudflare.ts` cumprem (verificado em client.contract.test.ts). */
export type DbClientModule = {
  getDb(): AppDb;
  getRuntimeEnv(): Record<string, string | undefined>;
};
