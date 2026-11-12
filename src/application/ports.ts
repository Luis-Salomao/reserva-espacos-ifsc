import type { ExistingOccupation } from "#/application/import-plan";
import type { SpaceEquipment } from "#/domain/equipment";
import type {
  ImportBatch,
  ImportBatchStatus,
  ImportChangeKind,
  ImportRow,
  ImportRowCounts,
  ImportRowStatus,
  ImportSummary,
  RoomMapping,
  TeacherMapping,
} from "#/domain/import-batch";
import type { NoticeData, NoticeKind } from "#/domain/notification";
import type { RequestStatus } from "#/domain/room-request";
import type { Semester } from "#/domain/semester";
import type { Space } from "#/domain/space";
import type { Role, User } from "#/domain/user";

/**
 * Equipamentos e observações a gravar, independentes: na edição, sem `items` os equipamentos
 * gravados ficam como estão, sem `notes` as observações também e sem `computersInMaintenance` o
 * número de computadores em manutenção também; na criação, ausente = não informado.
 */
export type EquipmentWrite = {
  items?: SpaceEquipment["items"];
  notes?: string | null;
  computersInMaintenance?: number | null;
};

/** Dados gravados de um espaço. Sem `equipment`, equipamentos e observações ficam como estão. */
export type SpaceWrite = { name: string; capacity: number | null; equipment?: EquipmentWrite };

export interface SpaceRepository {
  /** Só `id`, `name` e `capacity`, por nome. */
  list(): Promise<Space[]>;
  /** Como `list`, com `equipment` em cada espaço; tipos fora do catálogo ficam de fora. */
  listWithEquipment(): Promise<Space[]>;
  /** Com `equipment`, grava espaço, observações e equipamentos numa unidade atômica. */
  create(input: SpaceWrite): Promise<Space>;
  /**
   * Atualiza nome e capacidade; com `equipment.notes`, substitui as observações e, com
   * `equipment.items`, o conjunto inteiro de equipamentos, na mesma unidade atômica. `null` se o
   * espaço não existe.
   */
  update(id: string, input: SpaceWrite): Promise<Space | null>;
  /**
   * Apaga o espaço e seus equipamentos numa unidade atômica, só se nenhuma ocupação (ativa ou
   * cancelada), vínculo de sala do XML ou linha de importação o cita (condição na própria instrução).
   */
  remove(id: string): Promise<"removed" | "in_use" | "not_found">;
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
  /**
   * Ativa uma conta fantasma: grava e-mail e hash e tira a marca. `false` se a conta não existe
   * ou não é fantasma. E-mail em uso estoura a restrição única (confira antes).
   */
  activatePlaceholder(id: string, email: string, passwordHash: string): Promise<boolean>;
  /**
   * Funde a fantasma `fromId` na conta `toId` numa unidade atômica: ocupações (responsável e quem
   * criou), vínculos do XML, avisos e pedidos de sala passam para `toId`, as sessões da fantasma caem e ela é apagada. Só
   * age se `fromId` é fantasma e `toId` é conta ativa não fantasma; `false` se nada foi feito.
   */
  mergeInto(fromId: string, toId: string): Promise<boolean>;
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

/** Conta fantasma de um docente do XML: papel `docente`, hash de uma senha que ninguém conhece. */
export type NewPlaceholder = {
  id: string;
  email: string;
  name: string;
  code: string | null;
  passwordHash: string;
};

export interface TeacherMappingRepository {
  list(): Promise<TeacherMapping[]>;
  saveMany(items: readonly TeacherMapping[], updatedAt: string): Promise<void>;
  /**
   * Cria as contas fantasmas e grava (insere ou atualiza) os vínculos numa única unidade atômica:
   * se qualquer conta ou vínculo falha, nada do envio fica gravado.
   */
  saveWithPlaceholders(
    placeholders: readonly NewPlaceholder[],
    mappings: readonly TeacherMapping[],
    at: string,
  ): Promise<void>;
}

/** Filtro das linhas do lote; `search` casa com título, sala e detalhe do motivo. */
export type RowFilter = {
  status?: ImportRowStatus;
  reasonCode?: string;
  search?: string;
  changeKind?: ImportChangeKind;
};

export type ReasonCount = { status: ImportRowStatus; reasonCode: string | null; total: number };

type OccupationInfo = {
  id: string;
  spaceId: string;
  startsAt: string;
  endsAt: string;
  title: string;
  /** Lote que criou a ocupação (`null` se foi criada à mão). */
  batchId: string | null;
};

/** Ocupação importada da versão vigente do semestre (ativa ou cancelada à mão). */
export type VersionOccupation = {
  id: string;
  spaceId: string;
  startsAt: string;
  endsAt: string;
  title: string;
  lessonId: string | null;
  responsibleUserId: string | null;
  status: "ativa" | "cancelada";
};

/**
 * Fase de aplicação de uma nova versão: `mudancas` (cancelamentos e troca de responsável) termina
 * antes de qualquer `insercoes`, para que uma inserção possa ocupar o lugar de uma aula cancelada.
 */
export type ApplyPhase = "mudancas" | "insercoes";

export interface ImportRepository {
  findBatch(id: string): Promise<ImportBatch | null>;
  /** Vários lotes numa só consulta (os que não existem mais ficam de fora). */
  findBatches(ids: readonly string[]): Promise<ImportBatch[]>;
  findBatchByHash(semesterId: string, fileHash: string): Promise<ImportBatch | null>;
  /** Lote `aplicado` do semestre que substituiu este (o seguinte da cadeia), ou `null`. */
  findAppliedSuccessor(batchId: string): Promise<ImportBatch | null>;
  /** Grava o lote; se já existe lote com o mesmo (hash, semestre) não faz nada. */
  insertBatch(batch: ImportBatch): Promise<void>;
  /** Grava um bloco de linhas (até 50) numa unidade atômica; chaves já gravadas são ignoradas. */
  insertRows(rows: readonly ImportRow[]): Promise<void>;
  /** Chaves das linhas já gravadas do lote. */
  rowKeys(batchId: string): Promise<string[]>;
  /** Apaga um lote `preparando` ou `rascunho` e suas linhas (nunca ocupações, nem de outros estados). */
  deleteDraft(id: string): Promise<void>;
  /**
   * Apaga o lote e as linhas numa unidade atômica: `preparando`/`rascunho` sempre; `falhou` só se
   * nenhuma linha foi aplicada/cancelada e nenhuma ocupação nasceu dele. `false` = nada apagado.
   */
  discardBatch(id: string): Promise<boolean>;
  /** Outro lote do semestre `aplicando` ou `falhou` (no máximo um por semestre), ou `null`. */
  findInProgressBatch(semesterId: string): Promise<ImportBatch | null>;
  /**
   * Começa a aplicar numa única instrução condicional: o lote está `rascunho`/`falhou`, nenhum
   * outro lote do semestre está `aplicando`/`falhou` e o último `aplicado` do semestre é o lote
   * que ele substitui (ambos null-safe). Em caso de recusa diz qual foi a situação.
   */
  claimForApply(id: string): Promise<"ok" | "busy" | "stale" | "changed">;
  /**
   * Até `limit` linhas ainda por aplicar na fase, em ordem estável: `insercoes` = `pendente` ou
   * `falha` de inserção; `mudancas` = `cancelar`, `responsavel` ou `falha` dessas linhas.
   */
  pendingRows(batchId: string, limit: number, phase: ApplyPhase): Promise<ImportRow[]>;
  /**
   * Aplica as linhas `cancelar` e `responsavel` de um bloco numa unidade atômica: só cancela (ou
   * troca o responsável) se a ocupação importada ainda está `ativa`, e marca a linha na mesma unidade.
   */
  applyVersionRows(batchId: string, rows: readonly ImportRow[], now: string): Promise<void>;
  /** Último lote `aplicado` do semestre (o mais recente por conclusão), ou `null`. */
  latestAppliedBatchId(semesterId: string): Promise<string | null>;
  /**
   * Versão vigente: ocupações importadas dos lotes `aplicado` do semestre, ativas e canceladas à
   * mão, com início em `[from, to)`. As canceladas por uma nova versão (`nova_versao`) não contam.
   */
  listVersionOccupations(
    semesterId: string,
    from: string,
    to: string,
  ): Promise<VersionOccupation[]>;
  /**
   * Define o responsável (`lessonId → userId | null`) das ocupações importadas ATIVAS dos lotes
   * `aplicado` do semestre com início em `[from, to)`; aulas fora do mapa ficam como estão. Grava
   * em blocos atômicos de 50 aulas e só toca o que muda (repetir não grava nada). Devolve quantas
   * ocupações mudaram de responsável.
   */
  setResponsibles(
    semesterId: string,
    from: string,
    to: string,
    responsibles: ReadonlyMap<string, string | null>,
  ): Promise<number>;
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
  /**
   * Linhas do lote paginadas por GRUPO (aula + data): `limit`/`offset` contam grupos e as linhas de
   * um grupo nunca se separam entre páginas. Ordem: data (sem data por último), título, horário, chave.
   */
  listRowGroups(
    batchId: string,
    options: RowFilter & { limit: number; offset: number },
  ): Promise<ImportRow[]>;
  /** Quantos grupos (aula + data) passam pelo filtro. */
  countRowGroups(batchId: string, filter: RowFilter): Promise<number>;
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

/** Ocupação como o repositório a entrega (horários locais "YYYY-MM-DDTHH:MM"). */
export type OccupationRecord = {
  id: string;
  spaceId: string;
  startsAt: string;
  endsAt: string;
  source: "import" | "manual";
  batchId: string | null;
  lessonId: string | null;
  responsibleUserId: string | null;
  createdBy: string | null;
  title: string;
  status: "ativa" | "cancelada";
  /** Série de reservas avulsas recorrentes; `null` fora de série. */
  seriesId: string | null;
};

export type OccupationWithSpace = OccupationRecord & { spaceName: string };

export type ManualSeriesSlotUpdate = Pick<
  OccupationRecord,
  "id" | "spaceId" | "startsAt" | "endsAt" | "title"
>;

/** Ocupação que impediu uma reserva (só título e horários). */
type BlockingOccupation = { title: string; startsAt: string; endsAt: string };

type NewManualOccupation = {
  id: string;
  spaceId: string;
  startsAt: string;
  endsAt: string;
  title: string;
  createdBy: string;
  createdAt: string;
};

/** Datas de uma série recorrente: mesma sala, título e autor; cada data com seu id e horários. */
type NewSeries = {
  seriesId: string;
  spaceId: string;
  title: string;
  createdBy: string;
  createdAt: string;
  slots: ReadonlyArray<{ id: string; startsAt: string; endsAt: string }>;
};

export interface OccupationRepository {
  /** Atualiza apenas uma reserva manual própria futura e ativa, ignorando o próprio ID no conflito.
   * Todas as condições são verificadas na mesma instrução UPDATE (SQLite e D1).
   */
  updateManualIfFree(input: {
    id: string;
    createdBy: string;
    nowLocal: string;
    spaceId: string;
    startsAt: string;
    endsAt: string;
    title: string;
  }): Promise<boolean>;
  /**
   * Atualiza em uma instrução uma série manual própria. `expected` são os snapshots ativos que o
   * usuário revisou; se algum mudar, a contagem não corresponder ou houver conflito externo,
   * nenhuma linha é alterada. Exceções canceladas não entram na seleção e permanecem intactas.
   */
  updateManualSeriesIfFree(input: {
    seriesId: string;
    createdBy: string;
    nowLocal: string;
    scope: "future" | "serie";
    anchorStartsAt: string;
    expected: readonly ManualSeriesSlotUpdate[];
    updates: readonly ManualSeriesSlotUpdate[];
  }): Promise<boolean>;
  /** Próximas ocorrências ativas de uma série manual própria, ordenadas pela data. */
  listManualSeriesForUpdate(
    seriesId: string,
    createdBy: string,
    fromLocal: string,
  ): Promise<OccupationRecord[]>;
  /** Ocupações ativas do espaço que tocam `[from, to)`, por início. */
  listActiveInRange(spaceId: string, from: string, to: string): Promise<OccupationRecord[]>;
  /** Ocupações ativas de todos os espaços que tocam `[from, to)`, por espaço, início e id. */
  listActiveInRangeAll(from: string, to: string): Promise<OccupationRecord[]>;
  /**
   * Pares distintos `(title, responsibleUserId)` das ocupações importadas ativas que tocam
   * `[from, to)`. Avulsa, cancelada e fora do intervalo não entram. `responsibleUserId` null é
   * um par próprio (aula sem responsável).
   */
  listImportedTitles(
    from: string,
    to: string,
  ): Promise<Array<{ title: string; responsibleUserId: string | null }>>;
  findById(id: string): Promise<OccupationRecord | null>;
  /**
   * Insere a reserva avulsa só se nenhuma ocupação ativa do espaço se sobrepõe, numa única
   * instrução (`INSERT … SELECT … WHERE NOT EXISTS`): de duas reservas concorrentes, uma entra.
   * Sem inserção, devolve a ocupação que bloqueou (ou `null` se já foi cancelada nesse meio-tempo).
   */
  insertManualIfFree(
    input: NewManualOccupation,
  ): Promise<{ inserted: true } | { inserted: false; blocking: BlockingOccupation | null }>;
  /**
   * Insere todas as datas da série numa unidade atômica, cada uma só se nenhuma ocupação ativa do
   * espaço se sobrepõe; se alguma não entra, nenhuma fica gravada. `true` = todas gravadas.
   */
  insertSeriesIfFree(input: NewSeries): Promise<boolean>;
  /**
   * Cancela uma ocupação ativa; `false` se já não estava ativa. Com `notice`, grava o aviso na mesma
   * unidade atômica, só se esta chamada cancelou.
   */
  cancelOne(
    id: string,
    reason: string,
    at: string,
    notice?: NewNotification | null,
  ): Promise<boolean>;
  /**
   * Datas "YYYY-MM-DD" (ordenadas) da série da âncora a partir de `fromLocal`: mesma aula, lote,
   * espaço, dia da semana e horário. `onlyResponsible` restringe às linhas desse responsável
   * (não-admin; `NULL` nunca casa); `null` (admin) traz a série inteira.
   */
  seriesDates(
    anchor: OccupationRecord,
    fromLocal: string,
    onlyResponsible: string | null,
  ): Promise<string[]>;
  /**
   * Cancela a âncora e a série pela MESMA condição de `seriesDates`. Com `notice`, grava um único
   * aviso na mesma unidade atômica, só se a âncora foi cancelada por esta chamada.
   */
  cancelSeries(
    anchor: OccupationRecord,
    fromLocal: string,
    onlyResponsible: string | null,
    reason: string,
    at: string,
    notice?: NewNotification | null,
  ): Promise<number>;
  /** Próximas ocupações ativas criadas pelo usuário ou sob sua responsabilidade (termina depois de `fromLocal`). */
  listMine(
    userId: string,
    fromLocal: string,
    limit: number,
    offset: number,
  ): Promise<OccupationWithSpace[]>;
}

/** Aviso a gravar; `data` vira `data_json`. */
export type NewNotification = {
  id: string;
  userId: string;
  kind: NoticeKind;
  actorId: string | null;
  occupationId: string | null;
  requestId: string | null;
  data: NoticeData;
  createdAt: string;
};

export type StoredNotification = Omit<NewNotification, "createdAt"> & {
  createdAt: string;
  /** `null` = ainda não lido. */
  readAt: string | null;
};

export interface NotificationRepository {
  /** Avisos da pessoa, do mais novo ao mais antigo (os de pedido recebido ficam de fora: são cartões). */
  listFor(userId: string, limit: number): Promise<StoredNotification[]>;
  /** Avisos não lidos, sem contar os de pedido recebido. */
  unreadCount(userId: string): Promise<number>;
  markAllRead(userId: string, at: string): Promise<void>;
}

export type RoomRequestRecord = {
  id: string;
  occupationId: string;
  requesterId: string;
  ownerId: string;
  purpose: string;
  message: string | null;
  status: RequestStatus;
  decisionNote: string | null;
  createdAt: string;
  decidedAt: string | null;
  newOccupationId: string | null;
};

/** Pedido com o que a tela precisa da ocupação e das pessoas. */
export type RoomRequestRow = RoomRequestRecord & {
  requesterName: string;
  ownerName: string;
  spaceName: string;
  startsAt: string;
  endsAt: string;
  occupationStatus: "ativa" | "cancelada";
};

export type NewRoomRequest = Pick<
  RoomRequestRecord,
  "id" | "occupationId" | "requesterId" | "ownerId" | "purpose" | "message" | "createdAt"
> & { notice: NewNotification };

export type AcceptRequest = {
  requestId: string;
  ownerId: string;
  newOccupationId: string;
  at: string;
  /** Agora em hora de parede: o aceite só vale enquanto a ocupação não terminou. */
  nowLocal: string;
  /** Aviso para quem pediu; gravado só se o aceite valeu. */
  notice: NewNotification;
};

export interface RoomRequestRepository {
  /** Insere o pedido e o aviso ao dono atomicamente. `false` se já há pedido pendente igual. */
  create(input: NewRoomRequest): Promise<boolean>;
  findById(id: string): Promise<RoomRequestRow | null>;
  /** Pedidos pendentes recebidos pelo dono, do mais antigo ao mais novo. */
  listIncoming(ownerId: string): Promise<RoomRequestRow[]>;
  /** Pedidos feitos pela pessoa, do mais novo ao mais antigo (no máximo `limit`). */
  listOutgoing(requesterId: string, limit: number): Promise<RoomRequestRow[]>;
  /** Pendentes recebidos cuja ocupação ainda está ativa e termina depois de `nowLocal`. */
  countPendingIncoming(ownerId: string, nowLocal: string): Promise<number>;
  /** Recusa um pedido pendente do dono e avisa quem pediu na mesma unidade. `false` = nada mudou. */
  decline(input: {
    requestId: string;
    ownerId: string;
    note: string | null;
    at: string;
    notice: NewNotification;
  }): Promise<boolean>;
  /** Desistência de um pedido pendente de quem pediu. `false` = nada mudou. */
  withdraw(requestId: string, requesterId: string, at: string): Promise<boolean>;
  /**
   * Aceita numa unidade atômica: cancela a ocupação (`cedida`), cria a nova para quem pediu, marca o
   * pedido `aceito`, encerra os demais pendentes e avisa. Cada passo só age se o anterior valeu;
   * um pedido obsoleto não altera nada. `true` se o aceite valeu.
   */
  accept(input: AcceptRequest): Promise<boolean>;
}
