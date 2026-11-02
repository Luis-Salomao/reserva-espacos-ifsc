import type { PasswordHasher } from "#/application/ports";
import type { AppEnv } from "#/infra/env";
import { createPasswordHasher } from "./password-hasher.ts";

type HasherEnv = Pick<AppEnv, "PASSWORD_HASH" | "PASSWORD_SCRYPT_N" | "PASSWORD_PEPPER">;

// Cache de módulo: sobrevive entre requisições (num isolate de Workers ou no processo Bun), o que
// mantém um único objeto hasher por configuração e, com ele, um único hash fictício do login.
const cache = new Map<string, PasswordHasher>();

/**
 * Hasher de senha montado a partir do ambiente. Uma instância por (algoritmo, custo, pepper),
 * reaproveitada em todas as requisições.
 */
export function createConfiguredHasher(env: HasherEnv): PasswordHasher {
  const key = `${env.PASSWORD_HASH}|${env.PASSWORD_SCRYPT_N}|${env.PASSWORD_PEPPER ?? ""}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;
  const hasher = createPasswordHasher({
    algorithm: env.PASSWORD_HASH,
    scryptN: env.PASSWORD_SCRYPT_N,
    ...(env.PASSWORD_PEPPER === undefined ? {} : { pepper: env.PASSWORD_PEPPER }),
  });
  cache.set(key, hasher);
  return hasher;
}
