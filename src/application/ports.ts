import type { ExistingOccupation } from "#/application/import-plan";
import type {
  ImportBatch,
  ImportBatchStatus,
  ImportRow,
  ImportRowCounts,
  ImportRowStatus,
  ImportSummary,
  RoomMapping,
  TeacherMapping,
} from "#/domain/import-batch";
import type { Semester } from "#/domain/semester";
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

export interface SemesterRepository {
  /** Semestres com durações e blocos, do início mais recente para o mais antigo. */
  list(): Promise<Semester[]>;
  findById(id: string): Promise<Semester | null>;
  create(input: Omit<Semester, "id">): Promise<Semester>;
  /**
   * Substitui os dados e o conjunto inteiro de durações e blocos. `null` se o semestre não
   * existe. Atômico nos dois alvos (batch no D1, transação no bun:sqlite).
   */
  replace(id: string, input: Omit<Semester, "id">): Promise<Semester | null>;
}

export interface RoomMappingRepository {
  list(): Promise<RoomMapping[]>;
  /** Grava (insere ou atualiza pela id de origem) em blocos atômicos. */
  saveMany(items: readonly RoomMapping[], updatedAt: string): Promise<void>;
}

export interface TeacherMappingRepository {
  list(): Promise<TeacherMapping[]>;
  saveMany(items: readonly TeacherMapping[], updatedAt: string): Promise<void>;
}

/** Filtro das linhas do lote; `search` casa com título, sala e detalhe do motivo. */
export type RowFilter = { status?: ImportRowStatus; reasonCode?: string; search?: string };

export type ReasonCount = { status: ImportRowStatus; reasonCode: string | null; total: number };

export type OccupationInfo = {
  id: string;
  spaceId: string;
  startsAt: string;
  endsAt: string;
  title: string;
};

export interface ImportRepository {
  findBatch(id: string): Promise<ImportBatch | null>;
  findBatchByHash(semesterId: string, fileHash: string): Promise<ImportBatch | null>;
  /** Grava o lote; se já existe lote com o mesmo (hash, semestre) não faz nada. */
  insertBatch(batch: ImportBatch): Promise<void>;
  /** Grava um bloco de linhas (até 50) numa unidade atômica; chaves já gravadas são ignoradas. */
  insertRows(rows: readonly ImportRow[]): Promise<void>;
  /** Chaves das linhas já gravadas do lote. */
  rowKeys(batchId: string): Promise<string[]>;
  /** Apaga um lote `preparando` ou `rascunho` e suas linhas (nunca ocupações, nem de outros estados). */
  deleteDraft(id: string): Promise<void>;
  /** Até `limit` linhas ainda por aplicar (`pendente` ou `falha`), em ordem estável. */
  pendingRows(batchId: string, limit: number): Promise<ImportRow[]>;
  /**
   * Aplica as linhas de um bloco numa unidade atômica: insere cada ocupação só se não houver
   * ocupação ativa sobreposta no espaço e registra, na mesma unidade, `aplicada` ou `conflito`.
   */
  applyRows(batchId: string, rows: readonly ImportRow[], createdAt: string): Promise<void>;
  markFailed(
    batchId: string,
    rowKeys: readonly string[],
    code: string,
    detail: string,
  ): Promise<void>;
  /**
   * Compara-e-troca: muda o estado só se o lote está em um dos estados `from` (uma única
   * instrução UPDATE ... WHERE status IN ...). `false` = nada mudou (lote apagado ou em outro estado).
   */
  transition(
    id: string,
    from: readonly ImportBatchStatus[],
    to: { status: ImportBatchStatus; summary?: ImportSummary; appliedAt?: string | null },
  ): Promise<boolean>;
  countRows(batchId: string): Promise<ImportRowCounts>;
  listRows(
    batchId: string,
    options: RowFilter & { limit: number; offset: number },
  ): Promise<ImportRow[]>;
  /** Quantas linhas do lote passam pelo filtro (para paginar). */
  countFilteredRows(batchId: string, filter: RowFilter): Promise<number>;
  /** Linhas do lote agrupadas por situação e motivo. */
  reasonCounts(batchId: string): Promise<ReasonCount[]>;
  /** Lotes do mais recente para o mais antigo (no máximo `limit`). */
  listBatches(limit: number): Promise<ImportBatch[]>;
  /** Dados das ocupações pelas ids (para explicar com qual ocupação uma linha conflitou). */
  describeOccupations(ids: readonly string[]): Promise<OccupationInfo[]>;
  /** Ocupações ativas que se sobrepõem a `[from, to)`. */
  listActiveOccupations(from: string, to: string): Promise<ExistingOccupation[]>;
}
