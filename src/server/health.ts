import { createSpaceRepository } from "#/infra/db/repos/space-repository";
import { getEnv } from "#/infra/env";
import { getDb, getRuntimeEnv } from "#db-client";

export type Health = { ok: true; target: "local" | "cloudflare"; spaces: number };

/** Verifica configuração e banco; devolve o alvo ativo e quantos espaços existem. */
export async function getHealth(): Promise<Health> {
  const env = getEnv(getRuntimeEnv());
  const spaces = await createSpaceRepository(getDb()).list();
  return { ok: true, target: env.DEPLOY_TARGET, spaces: spaces.length };
}
