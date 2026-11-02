import type {
  Clock,
  LoginAttemptRepository,
  PasswordHasher,
  RandomSource,
  SessionRepository,
  UserRepository,
} from "#/application/ports";
import { normalizeEmail, type User } from "#/domain/user";

export const MIN_PASSWORD_LENGTH = 10;
const DAY_MS = 24 * 60 * 60 * 1000;
const SESSION_TTL_MS = 7 * DAY_MS;
const RENEW_BELOW_MS = DAY_MS;
const MAX_FAILURES = 5;
const LOCK_WINDOW_MS = 15 * 60 * 1000;

const MAX_EMAIL_LENGTH = 254;
const MAX_PASSWORD_LENGTH = 1024;
const PURGE_ATTEMPTS_OLDER_THAN_MS = DAY_MS;

export function validatePassword(password: string): string | null {
  return password.length >= MIN_PASSWORD_LENGTH
    ? null
    : `A senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`;
}

export type LoginResult =
  | { ok: true; token: string; user: User }
  | { ok: false; reason: "invalid" | "locked" };

export type AuthDeps = {
  users: UserRepository;
  sessions: SessionRepository;
  hasher: PasswordHasher;
  attempts: LoginAttemptRepository;
  clock: Clock;
  random: RandomSource;
};

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return toHex(new Uint8Array(digest));
}

export function createAuthService(deps: AuthDeps) {
  const { users, sessions, hasher, attempts, clock, random } = deps;

  // Hash fictício gerado pelo próprio hasher configurado (mesmo algoritmo e custo do real), para que
  // email inexistente leve o mesmo tempo. Calculado uma vez, sob demanda, e memoizado.
  let dummyHash: Promise<string> | undefined;
  const getDummyHash = (): Promise<string> => {
    if (dummyHash === undefined) {
      const pending = hasher.hash(toBase64Url(random.bytes(16)));
      dummyHash = pending;
      // Se a geração falhar, descarta a promessa memoizada para a próxima tentativa recomeçar.
      pending.catch(() => {
        if (dummyHash === pending) dummyHash = undefined;
      });
    }
    return dummyHash;
  };

  return {
    async login(email: string, password: string): Promise<LoginResult> {
      if (email.length > MAX_EMAIL_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
        await hasher.verify(password.slice(0, MAX_PASSWORD_LENGTH), await getDummyHash());
        return { ok: false, reason: "invalid" };
      }
      const normalized = normalizeEmail(email);
      const now = clock.now();
      await attempts.purgeOlderThan(
        new Date(now.getTime() - PURGE_ATTEMPTS_OLDER_THAN_MS).toISOString(),
      );
      const since = new Date(now.getTime() - LOCK_WINDOW_MS).toISOString();
      // Limitação conhecida: contagem e registro não são atômicos (sem transação em D1), então
      // requisições concorrentes podem ultrapassar o limite de 5 falhas por alguns instantes.
      if ((await attempts.countFailuresSince(normalized, since)) >= MAX_FAILURES) {
        return { ok: false, reason: "locked" };
      }

      const record = await users.findByEmail(normalized);
      const passwordOk = await hasher.verify(
        password,
        record?.passwordHash ?? (await getDummyHash()),
      );
      if (!record?.active || !passwordOk) {
        await attempts.record({
          email: normalized,
          attemptedAt: now.toISOString(),
          success: false,
        });
        return { ok: false, reason: "invalid" };
      }

      await attempts.clearFailures(normalized);
      await attempts.record({ email: normalized, attemptedAt: now.toISOString(), success: true });
      if (hasher.needsRehash(record.passwordHash)) {
        await users.updatePasswordHash(record.id, await hasher.hash(password));
      }

      const token = toBase64Url(random.bytes(32));
      await sessions.create({
        id: toHex(random.bytes(16)),
        userId: record.id,
        tokenHash: await hashToken(token),
        createdAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + SESSION_TTL_MS).toISOString(),
        lastSeenAt: now.toISOString(),
      });
      const { passwordHash: _omit, ...user } = record;
      return { ok: true, token, user };
    },

    /** Valida o token; renova a sessão quando falta menos de 1 dia. */
    async authenticate(token: string): Promise<User | null> {
      if (token === "") return null;
      const tokenHash = await hashToken(token);
      const session = await sessions.findByTokenHash(tokenHash);
      if (!session) return null;
      const now = clock.now();
      const expiresAt = Date.parse(session.expiresAt);
      if (expiresAt <= now.getTime()) {
        await sessions.deleteByTokenHash(tokenHash);
        return null;
      }
      const user = await users.findById(session.userId);
      if (!user?.active) {
        await sessions.deleteByTokenHash(tokenHash);
        return null;
      }
      if (expiresAt - now.getTime() < RENEW_BELOW_MS) {
        await sessions.extend(session.id, {
          lastSeenAt: now.toISOString(),
          expiresAt: new Date(now.getTime() + SESSION_TTL_MS).toISOString(),
        });
      }
      return user;
    },

    async logout(token: string): Promise<void> {
      if (token === "") return;
      await sessions.deleteByTokenHash(await hashToken(token));
    },
  };
}
