import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { createAuthService } from "#/application/auth";
import { createPasswordHasher } from "#/infra/auth/password-hasher";
import { createLoginAttemptRepository } from "#/infra/db/repos/login-attempt-repository";
import { createSessionRepository } from "#/infra/db/repos/session-repository";
import { createUserRepository } from "#/infra/db/repos/user-repository";
import { getEnv } from "#/infra/env";
import { cryptoRandom, systemClock } from "#/infra/runtime";
import { getDb, getRuntimeEnv } from "#db-client";
import { resolveSession } from "./auth-handlers.ts";

/**
 * Raiz de composição da autenticação: monta o serviço por requisição (em Workers o env e o
 * binding D1 só existem dentro da requisição) a partir do banco, do hasher e do ambiente.
 */
export function getAuth() {
  const env = getEnv(getRuntimeEnv());
  const db = getDb();
  return createAuthService({
    users: createUserRepository(db),
    sessions: createSessionRepository(db),
    attempts: createLoginAttemptRepository(db),
    hasher: createPasswordHasher({
      algorithm: env.PASSWORD_HASH,
      scryptN: env.PASSWORD_SCRYPT_N,
      ...(env.PASSWORD_PEPPER === undefined ? {} : { pepper: env.PASSWORD_PEPPER }),
    }),
    clock: systemClock,
    random: cryptoRandom,
  });
}

/** Sessão da requisição em curso + configuração de leitura pública; renova o cookie se válido. */
export async function getRequestSession() {
  const request = getRequest();
  const { user, setCookie } = await resolveSession(
    request.headers.get("cookie"),
    request.url,
    getAuth(),
  );
  if (setCookie !== null) setResponseHeader("Set-Cookie", setCookie);
  setResponseHeader("Cache-Control", "no-store");
  return { user, publicRead: getEnv(getRuntimeEnv()).PUBLIC_READ };
}
