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

/**
 * Hash fixo e válido (salt e chave sem segredo): usado para que email inexistente também
 * execute um `verify`, igualando o tempo de resposta. Nunca confere com senha alguma na prática.
 */
const DUMMY_HASH =
  "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

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

  return {
    async login(email: string, password: string): Promise<LoginResult> {
      const normalized = normalizeEmail(email);
      const now = clock.now();
      const since = new Date(now.getTime() - LOCK_WINDOW_MS).toISOString();
      if ((await attempts.countFailuresSince(normalized, since)) >= MAX_FAILURES) {
        return { ok: false, reason: "locked" };
      }

      const record = await users.findByEmail(normalized);
      const passwordOk = await hasher.verify(password, record?.passwordHash ?? DUMMY_HASH);
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
      if (!user?.active) return null;
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
