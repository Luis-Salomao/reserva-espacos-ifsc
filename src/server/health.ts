import { createSpaceRepository } from "#/infra/db/repos/space-repository";
import { getEnv } from "#/infra/env";
import { getDb, getRuntimeEnv } from "#db-client";

export type Health = { ok: true; target: "local" | "cloudflare"; spaces: number } | { ok: false };

/** Verifica configuração e banco. Em falha devolve só `{ ok: false }`, sem detalhes internos. */
export async function getHealth(): Promise<Health> {
  try {
    const env = getEnv(getRuntimeEnv());
    const spaces = await createSpaceRepository(getDb()).list();
    return { ok: true, target: env.DEPLOY_TARGET, spaces: spaces.length };
  } catch {
    return { ok: false };
  }
}
