import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import type { AppDb } from "#/infra/db/client";
import * as schema from "#/infra/db/schema";

/** Banco D1 (Cloudflare Workers). O binding `DB` vem do wrangler. */
export function getDb(): AppDb {
  return drizzle(env.DB, { schema });
}
