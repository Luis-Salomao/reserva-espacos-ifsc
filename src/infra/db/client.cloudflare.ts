import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import type { AppDb } from "#/infra/db/client";
import * as schema from "#/infra/db/schema";

/** Banco D1 (Cloudflare Workers). O binding `DB` vem do wrangler. */
export function getDb(): AppDb {
  return drizzle(env.DB, { schema });
}

/** Fonte das variáveis de ambiente neste alvo: `vars` do wrangler (somente valores texto). */
export function getRuntimeEnv(): Record<string, string | undefined> {
  const vars: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === "string") vars[key] = value;
  }
  return vars;
}
