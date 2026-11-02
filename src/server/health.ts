import { createSpaceRepository } from "#/infra/db/repos/space-repository";
import { getEnv } from "#/infra/env";
import { getDb, getRuntimeEnv } from "#db-client";

export type Health = { ok: true; target: "local" | "cloudflare"; spaces?: number } | { ok: false };

/** Status HTTP da rota de saúde: 200 quando saudável, 503 caso contrário. */
export function healthStatus(health: Health): 200 | 503 {
  return health.ok ? 200 : 503;
}

/**
 * Verifica configuração e banco. Em falha devolve só `{ ok: false }` (sem detalhes ao cliente);
 * o motivo (apenas nome e mensagem do erro) vai ao log do servidor.
 */
export async function getHealth(): Promise<Health> {
  try {
    const env = getEnv(getRuntimeEnv());
    const spaces = await createSpaceRepository(getDb()).list();
    // Com PUBLIC_READ=false o sistema é fechado: a rota pública não revela nem a contagem de espaços.
    return env.PUBLIC_READ
      ? { ok: true, target: env.DEPLOY_TARGET, spaces: spaces.length }
      : { ok: true, target: env.DEPLOY_TARGET };
  } catch (error) {
    console.error(
      "[health] falha:",
      error instanceof Error ? `${error.name}: ${error.message}` : "erro desconhecido",
    );
    return { ok: false };
  }
}
