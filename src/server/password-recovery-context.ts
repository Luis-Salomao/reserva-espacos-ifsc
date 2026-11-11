import { getRequest, getRequestIP } from "@tanstack/react-start/server";
import { createPasswordRecoveryService } from "#/application/password-recovery";
import { createConfiguredHasher } from "#/infra/auth/configured-hasher";
import { recoveryTokens } from "#/infra/auth/recovery-tokens";
import { createPasswordRecoveryRepository } from "#/infra/db/repos/password-recovery-repository";
import { createUserRepository } from "#/infra/db/repos/user-repository";
import { getEnv } from "#/infra/env";
import { systemClock } from "#/infra/runtime";
import { getDb, getRuntimeEnv } from "#db-client";
import { getEmailContext } from "./email-context";

export function getPasswordRecovery() {
  const db = getDb();
  const env = getEnv(getRuntimeEnv());
  const email = getEmailContext();
  return createPasswordRecoveryService({
    users: createUserRepository(db),
    repository: createPasswordRecoveryRepository(db),
    hasher: createConfiguredHasher(env),
    tokens: recoveryTokens,
    clock: systemClock,
    email: email === null ? null : { publicOrigin: email.config.publicOrigin, codec: email.codec },
  });
}

export function getRecoveryClient(): string {
  const env = getEnv(getRuntimeEnv());
  // Só o Worker confia no cabeçalho sobrescrito pela borda Cloudflare; XFF nunca é aceito.
  if (env.DEPLOY_TARGET === "cloudflare")
    return getRequest().headers.get("cf-connecting-ip")?.slice(0, 64) ?? "unknown";
  return getRequestIP({ xForwardedFor: false }) ?? "unknown";
}
