import type { Space } from "#/domain/space";
import type { Role, User } from "#/domain/user";

export interface SpaceRepository {
  list(): Promise<Space[]>;
  create(input: { name: string; capacity: number | null }): Promise<Space>;
  /** Atualiza nome e capacidade; `null` se o espaço não existe. */
  update(id: string, input: { name: string; capacity: number | null }): Promise<Space | null>;
}

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(password: string, stored: string): Promise<boolean>;
  needsRehash(stored: string): boolean;
}

export type UserRecord = User & { passwordHash: string };

export interface UserRepository {
  /** Busca por email já normalizado (minúsculas, sem espaços). */
  findByEmail(email: string): Promise<UserRecord | null>;
  findById(id: string): Promise<User | null>;
  create(input: {
    email: string;
    name: string;
    code: string | null;
    roles: Role[];
    passwordHash: string;
  }): Promise<User>;
  updatePasswordHash(id: string, passwordHash: string): Promise<void>;
  /** Todas as contas (sem hash), ordenadas por nome. */
  list(): Promise<User[]>;
  /** Busca por sigla exata. */
  findByCode(code: string): Promise<User | null>;
  /**
   * Atualiza nome, sigla e papéis. `null` se a conta não existe ou se a mudança tiraria o papel
   * admin do último administrador ativo (checagem atômica na própria instrução).
   */
  update(
    id: string,
    input: { name: string; code: string | null; roles: Role[] },
  ): Promise<User | null>;
  /**
   * Ativa/desativa. `false` se a conta não existe ou se desativá-la deixaria o sistema sem
   * administrador ativo (checagem atômica na própria instrução).
   */
  setActive(id: string, active: boolean): Promise<boolean>;
}

/** Sessão persistida. Só o SHA-256 do token existe no banco. Datas em ISO 8601 UTC. */
export type Session = {
  id: string;
  userId: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
  lastSeenAt: string;
};

export interface SessionRepository {
  create(session: Session): Promise<void>;
  findByTokenHash(tokenHash: string): Promise<Session | null>;
  extend(id: string, input: { lastSeenAt: string; expiresAt: string }): Promise<void>;
  deleteByTokenHash(tokenHash: string): Promise<void>;
  /** Revoga todas as sessões do usuário (desativação, redefinição de senha). */
  revokeAllForUser(userId: string): Promise<void>;
}

export interface LoginAttemptRepository {
  record(input: { email: string; attemptedAt: string; success: boolean }): Promise<void>;
  /** Falhas do email com `attemptedAt >= since` (ISO). */
  countFailuresSince(email: string, since: string): Promise<number>;
  /** Apaga tentativas (sucesso ou falha) anteriores a `before` (ISO). */
  purgeOlderThan(before: string): Promise<void>;
  /** Apaga as falhas registradas do email (após login bem-sucedido). */
  clearFailures(email: string): Promise<void>;
}

export interface Clock {
  now(): Date;
}

export interface RandomSource {
  bytes(length: number): Uint8Array;
}
