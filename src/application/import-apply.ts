import type {
  ApplyPhase,
  Clock,
  ImportRepository,
  RoomMappingRepository,
  SemesterRepository,
  TeacherMappingRepository,
} from "#/application/ports";
import { fail, ok, type Result } from "#/application/validation";
import {
  EMPTY_COUNTS,
  type ImportBatch,
  type ImportRow,
  type ImportRowCounts,
  type ImportSummary,
  pendingTotal,
  type VersionSummary,
} from "#/domain/import-batch";
import { BUSY_MESSAGE, STALE_MESSAGE } from "#/domain/import-conflicts";
import { IGNORE_ROOM, type PlanInput, planImport, responsibleOf } from "./import-plan";
import { plannedRows } from "./import-rows";
import { planVersion } from "./version-plan";

/** Linhas por bloco atômico de aplicação: cada linha usa até 3 instruções, então ≤ 90 instruções. */
const ROWS_PER_CHUNK = 30;
/** Linhas por chamada de gravação do rascunho (uma instrução por linha; o D1 limita parâmetros). */
const ROWS_PER_WRITE = 50;
/**
 * Orçamento por chamada (o Workers limita as consultas por invocação; ~50 no plano Free). Conta:
 * `prepare` gasta ~9 consultas fixas (lote por hash, vínculos x2, versão vigente, ocupações,
 * semestre, inserir lote, chaves, contagem e fechar) + até `maxCalls` gravações de 50 linhas = 39
 * com o padrão 30 (1500 linhas). `apply` gasta ~7 fixas (lote, contagem, estado, pendentes de cada
 * fase, contagem, estado) + até `maxChunks` blocos de 30 linhas = 37 com o padrão 30 (900 linhas).
 * Verificado só no D1 local (workerd): 20 blocos por passo rodaram sem erro; o limite do D1 remoto
 * NÃO foi medido. Se o D1 conta cada instrução de um `batch` separadamente, reduza os padrões.
 */
const DEFAULT_PREPARE_CALLS = 30;
const DEFAULT_APPLY_CHUNKS = 30;

const FAILURE_CODE = "erro_gravacao";
const FAILURE_DETAIL = "Não foi possível gravar este grupo de linhas. Aplique o lote novamente.";
const PARTIAL_MESSAGE =
  "O arquivo foi lido só em parte (cards demais); a importação foi recusada para não gerar um lote incompleto.";
const CHANGED_MESSAGE =
  "O lote foi alterado por outra operação enquanto esta rodava. Recarregue e tente de novo.";
const PREPARING_MESSAGE = "O lote ainda está sendo preparado. Conclua o preparo antes de aplicar.";
const INCOMPLETE_MESSAGE =
  "O lote está incompleto (faltam linhas). Envie o arquivo de novo para refazer o preparo.";
const DISCARD_APPLIED_MESSAGE = "Lote aplicado ou em aplicação não pode ser descartado.";
const DISCARD_PARTIAL_MESSAGE =
  "Este lote já aplicou parte das mudanças; retome a aplicação para concluir.";
const NO_VERSION_MESSAGE = "Este semestre não tem versão aplicada.";
const OTHER_FILE_MESSAGE = "Envie o mesmo arquivo da versão aplicada.";

/** SHA-256 (hexadecimal) dos bytes do arquivo; junto do semestre identifica o lote. */
export async function hashImportFile(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export type ImportServiceDeps = {
  imports: ImportRepository;
  rooms: RoomMappingRepository;
  teachers: TeacherMappingRepository;
  semesters: SemesterRepository;
  clock: Clock;
};

export type PrepareInput = {
  semesterId: string;
  /** SHA-256 hexadecimal dos bytes do XML (`hashImportFile`). */
  fileHash: string;
  /** `partial`: a leitura do arquivo foi truncada (ex.: cards demais); é recusada. */
  preview: PlanInput["preview"] & { partial: boolean };
  actorId: string;
};

/** Progresso de um passo: `done` quando não resta nada; `remaining` em linhas. */
export type StepOutput = { batch: ImportBatch; done: boolean; remaining: number };

type RefreshInput = {
  semesterId: string;
  /** SHA-256 do XML enviado; precisa ser o do último lote aplicado do semestre. */
  fileHash: string;
  preview: Pick<PlanInput["preview"], "timetable">;
};

/** `withoutResponsible`: ocupações importadas ativas da versão que seguem sem responsável. */
type RefreshOutput = { changed: number; withoutResponsible: number };

export type PrepareOutput = StepOutput & {
  /** `true` quando o mesmo arquivo já tinha lote concluído neste semestre (nada novo é criado). */
  reused: boolean;
  /**
   * Presente quando o arquivo é de uma versão JÁ SUBSTITUÍDA por outra aplicada (`appliedAt` = quando
   * a substituta foi aplicada). Voltar a uma versão anterior não é suportado: nada é refeito.
   */
  superseded?: { appliedAt: string };
};

function summarize(rows: readonly ImportRow[], version?: VersionSummary): ImportSummary {
  const counts: ImportRowCounts = { ...EMPTY_COUNTS };
  const notApplicable: Record<string, number> = {};
  const bySpace = new Map<string | null, number>();
  for (const row of rows) {
    counts[row.status] += 1;
    bySpace.set(row.spaceId, (bySpace.get(row.spaceId) ?? 0) + 1);
    if (row.status === "nao_aplicavel" && row.reasonCode !== null) {
      notApplicable[row.reasonCode] = (notApplicable[row.reasonCode] ?? 0) + 1;
    }
  }
  return {
    rows: rows.length,
    notApplicable,
    counts,
    bySpace: [...bySpace.entries()]
      .map(([spaceId, rows]) => ({ spaceId, rows }))
      .sort((a, b) =>
        a.spaceId === null ? 1 : b.spaceId === null ? -1 : a.spaceId.localeCompare(b.spaceId),
      ),
    ...(version === undefined ? {} : { version }),
  };
}

/**
 * SHA-256 do conteúdo canônico das linhas planejadas (chave, situação, tipo de mudança, motivo,
 * ocupação, espaço, horários, responsável, título) e da versão que o lote substitui.
 */
async function fingerprint(
  rows: readonly ImportRow[],
  supersedesBatchId: string | null,
): Promise<string> {
  const canonical = [...rows]
    .sort((x, y) => (x.rowKey < y.rowKey ? -1 : x.rowKey > y.rowKey ? 1 : 0))
    .map((row) => [
      row.rowKey,
      row.status,
      row.changeKind,
      row.reasonCode,
      row.occupationId,
      row.conflictOccupationId,
      row.spaceId,
      row.date,
      row.startTime,
      row.endTime,
      row.weekday,
      row.responsibleUserId,
      row.title,
    ]);
  return hashImportFile(new TextEncoder().encode(JSON.stringify([supersedesBatchId, canonical])));
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function total(counts: ImportRowCounts): number {
  return Object.values(counts).reduce((sum, value) => sum + value, 0);
}

export function createImportService(deps: ImportServiceDeps) {
  const { imports, rooms, teachers, semesters, clock } = deps;

  async function loadMaps(): Promise<Pick<PlanInput, "roomMap" | "teacherMap">> {
    const [roomRows, teacherRows] = await Promise.all([rooms.list(), teachers.list()]);
    const roomMap = new Map<string, string>();
    for (const row of roomRows) {
      if (row.ignored) roomMap.set(row.sourceRoomId, IGNORE_ROOM);
      else if (row.spaceId !== null) roomMap.set(row.sourceRoomId, row.spaceId);
    }
    const teacherMap = new Map<string, string | null>();
    for (const row of teacherRows) teacherMap.set(row.sourceTeacherId, row.userId);
    return { roomMap, teacherMap };
  }

  return {
    /**
     * Descarta um lote `preparando`/`rascunho`, ou `falhou` que ainda não aplicou nada. Um lote
     * interrompido que já cancelou ou inseriu algo só pode ser retomado (descartar deixaria meio estado).
     */
    async discardBatch(batchId: string): Promise<Result<null>> {
      const batch = await imports.findBatch(batchId);
      if (batch === null) return fail("not_found", "Lote de importação não encontrado.");
      if (batch.status === "aplicado" || batch.status === "aplicando") {
        return fail("conflict", DISCARD_APPLIED_MESSAGE);
      }
      if (batch.status === "falhou") {
        const counts = await imports.countRows(batchId);
        if (counts.aplicada + counts.cancelada_versao + counts.responsavel_atualizado > 0) {
          return fail("conflict", DISCARD_PARTIAL_MESSAGE);
        }
      }
      if (!(await imports.discardBatch(batchId))) {
        return fail("conflict", DISCARD_PARTIAL_MESSAGE);
      }
      return ok(null);
    },

    /**
     * Prepara o lote em passos (cada chamada grava no máximo `maxCalls` blocos de 50 linhas).
     * Estados: `preparando` (linhas sendo gravadas) → `rascunho` (completo e conferido: linhas ==
     * resumo). Um lote `preparando` do mesmo (arquivo, semestre) é retomado, nunca reutilizado;
     * se as linhas gravadas não são do plano atual, é apagado e refeito. Lote `aplicando`,
     * `aplicado` ou `falhou` é devolvido como está (`reused`). Um `rascunho` é refeito com os
     * vínculos atuais. Prévia truncada é recusada.
     *
     * Se o semestre já tem um lote `aplicado`, o arquivo é uma NOVA VERSÃO: as linhas descrevem a
     * diferença para a versão vigente (inserir, cancelar, trocar responsável, informativas) e o
     * lote registra `supersedesBatchId`. Sem lote aplicado, é a primeira versão (Fase 1b).
     */
    async prepare(
      input: PrepareInput,
      options: { maxCalls?: number } = {},
    ): Promise<Result<PrepareOutput>> {
      if (input.preview.partial) return fail("validation", PARTIAL_MESSAGE);
      const semester = await semesters.findById(input.semesterId);
      if (semester === null) return fail("not_found", "Semestre não encontrado.");

      // Mesmo arquivo já aplicado (ou em aplicação): reconhecido pelo hash, sem planejar nem comparar.
      const known = await imports.findBatchByHash(input.semesterId, input.fileHash);
      if (known !== null && known.status !== "preparando" && known.status !== "rascunho") {
        const successor =
          known.status === "aplicado" ? await imports.findAppliedSuccessor(known.id) : null;
        const superseded =
          successor === null
            ? {}
            : { superseded: { appliedAt: successor.appliedAt ?? successor.createdAt } };
        return ok({ batch: known, reused: true, done: true, remaining: 0, ...superseded });
      }

      // No máximo um lote por semestre em andamento (aplicando ou interrompido).
      if ((await imports.findInProgressBatch(input.semesterId)) !== null) {
        return fail("conflict", BUSY_MESSAGE);
      }

      const maps = await loadMaps();
      const from = `${semester.start}T00:00`;
      const to = `${semester.end}T24:00`;
      const supersedes = await imports.latestAppliedBatchId(input.semesterId);
      const occupied = await imports.listActiveOccupations(from, to);
      let planned: ImportRow[];
      let version: VersionSummary | undefined;
      if (supersedes === null) {
        planned = plannedRows(
          planImport({ preview: input.preview, semester, ...maps, existing: occupied }),
        );
      } else {
        const current = await imports.listVersionOccupations(input.semesterId, from, to);
        const plan = planVersion({
          preview: input.preview,
          semester,
          ...maps,
          active: occupied,
          current,
          supersedesBatchId: supersedes,
        });
        planned = plan.rows;
        version = plan.version;
      }
      const summary = summarize(planned, version);
      const planHash = await fingerprint(planned, supersedes);
      const planKeys = new Set(planned.map((row) => row.rowKey));
      const budget = options.maxCalls ?? DEFAULT_PREPARE_CALLS;

      for (let attempt = 0; attempt < 2; attempt++) {
        let batch = await imports.findBatchByHash(input.semesterId, input.fileHash);
        if (batch !== null && batch.status === "rascunho") {
          await imports.deleteDraft(batch.id);
          batch = null;
        }
        if (batch === null) {
          await imports.insertBatch({
            id: crypto.randomUUID(),
            semesterId: input.semesterId,
            fileHash: input.fileHash,
            summary,
            planHash,
            status: "preparando",
            createdBy: input.actorId,
            createdAt: clock.now().toISOString(),
            appliedAt: null,
            supersedesBatchId: supersedes,
          });
          // Se outra requisição criou antes, o lote dela (outro id) é o que vale.
          batch = await imports.findBatchByHash(input.semesterId, input.fileHash);
          if (batch === null) throw new Error("Lote de importação não encontrado após a criação.");
        }
        if (batch.status !== "preparando") {
          return ok({ batch, reused: true, done: true, remaining: 0 });
        }
        const batchId = batch.id;
        const written = new Set(await imports.rowKeys(batchId));
        // O plano mudou (vínculos, conflitos, motivos, versão vigente) ou há linhas que não são dele: refaz do zero.
        if (batch.planHash !== planHash || [...written].some((key) => !planKeys.has(key))) {
          await imports.deleteDraft(batchId);
          continue;
        }
        const missing = planned.filter((row) => !written.has(row.rowKey));
        let calls = 0;
        let remaining = missing.length;
        for (const group of chunks(missing, ROWS_PER_WRITE)) {
          if (calls >= budget) break;
          await imports.insertRows(group.map((row) => ({ ...row, batchId })));
          calls++;
          remaining -= group.length;
        }
        if (remaining > 0) {
          return ok({ batch: { ...batch, summary }, reused: false, done: false, remaining });
        }
        const stored = total(await imports.countRows(batchId));
        if (stored !== summary.rows) {
          return ok({
            batch: { ...batch, summary },
            reused: false,
            done: false,
            remaining: Math.max(summary.rows - stored, 1),
          });
        }
        const closed = await imports.transition(batchId, ["preparando"], {
          status: "rascunho",
          summary,
          appliedAt: null,
        });
        if (!closed) return fail("conflict", CHANGED_MESSAGE);
        return ok({
          batch: { ...batch, status: "rascunho", summary },
          reused: false,
          done: true,
          remaining: 0,
        });
      }
      return fail("conflict", "Não foi possível preparar o lote agora. Tente novamente.");
    },

    /**
     * Aplica (ou retoma) o lote em passos de no máximo `maxChunks` blocos atômicos de 30 linhas.
     * Recusa lote `preparando`, cujas linhas não batem com o resumo, ou (ao começar) preparado
     * sobre uma versão que já não é a última aplicada. Numa nova versão, a fase de mudanças
     * (cancelar e trocar responsável) termina antes de qualquer inserção. Parar pelo orçamento
     * deixa o lote `aplicando` (retomável); `falhou` só ocorre em erro real de gravação (as linhas
     * do bloco viram `falha`, motivo genérico). Ocupação sobreposta surgida depois da prévia vira
     * linha `conflito`. Chamar de novo continua de onde parou, sem duplicar nem cancelar de novo.
     */
    async apply(
      batchId: string,
      options: { maxChunks?: number } = {},
    ): Promise<Result<StepOutput>> {
      const batch = await imports.findBatch(batchId);
      if (batch === null) return fail("not_found", "Lote de importação não encontrado.");
      if (batch.status === "aplicado") return ok({ batch, done: true, remaining: 0 });
      if (batch.status === "preparando") return fail("conflict", PREPARING_MESSAGE);
      if (total(await imports.countRows(batchId)) !== batch.summary.rows) {
        return fail("conflict", INCOMPLETE_MESSAGE);
      }
      if (batch.status !== "aplicando") {
        // Uma única instrução condicional: sem outro lote em andamento no semestre e ainda sobre a última versão.
        const claim = await imports.claimForApply(batchId);
        if (claim === "busy") return fail("conflict", BUSY_MESSAGE);
        if (claim === "stale") return fail("conflict", STALE_MESSAGE);
        if (claim === "changed") return fail("conflict", CHANGED_MESSAGE);
      }
      let chunksLeft = options.maxChunks ?? DEFAULT_APPLY_CHUNKS;
      const createdAt = clock.now().toISOString();
      const phases: ApplyPhase[] =
        batch.summary.version === undefined ? ["insercoes"] : ["mudancas", "insercoes"];
      let errored = false;
      for (const phase of phases) {
        if (errored || chunksLeft <= 0) break;
        const limit = chunksLeft * ROWS_PER_CHUNK;
        const pending = await imports.pendingRows(batchId, limit, phase);
        for (const group of chunks(pending, ROWS_PER_CHUNK)) {
          try {
            if (phase === "mudancas") await imports.applyVersionRows(batchId, group, createdAt);
            else await imports.applyRows(batchId, group, createdAt);
          } catch {
            await imports.markFailed(
              batchId,
              group.map((row) => row.rowKey),
              FAILURE_CODE,
              FAILURE_DETAIL,
            );
            errored = true;
            break;
          }
          chunksLeft--;
        }
        // Fase com mais linhas do que o orçamento: a próxima só começa quando esta terminar.
        if (pending.length >= limit) break;
      }
      const counts = await imports.countRows(batchId);
      const remaining = pendingTotal(counts);
      const status = remaining === 0 ? "aplicado" : errored ? "falhou" : "aplicando";
      const appliedAt = status === "aplicado" ? clock.now().toISOString() : null;
      const summary = { ...batch.summary, counts };
      const finished = await imports.transition(batchId, ["aplicando"], {
        status,
        summary,
        appliedAt,
      });
      if (!finished) {
        // Outra chamada concluiu (ou o lote foi refeito/apagado) enquanto esta rodava.
        const current = await imports.findBatch(batchId);
        if (current?.status === "aplicado") return ok({ batch: current, done: true, remaining: 0 });
        return fail("conflict", CHANGED_MESSAGE);
      }
      return ok({
        batch: { ...batch, status, summary, appliedAt },
        done: remaining === 0,
        remaining,
      });
    },

    /**
     * Reaplica os vínculos de docentes atuais à versão aplicada do semestre: cada ocupação
     * importada ativa recebe o responsável da sua aula (`responsibleOf`). Exige o mesmo arquivo da
     * versão aplicada (o lote não guarda os docentes de cada aula); arquivo diferente é recusado
     * antes de qualquer escrita. Repetir chega ao mesmo resultado.
     */
    async refreshResponsibles(input: RefreshInput): Promise<Result<RefreshOutput>> {
      const semester = await semesters.findById(input.semesterId);
      if (semester === null) return fail("not_found", "Semestre não encontrado.");
      const latest = await imports.latestAppliedBatchId(input.semesterId);
      const batch = latest === null ? null : await imports.findBatch(latest);
      if (batch === null) return fail("not_found", NO_VERSION_MESSAGE);
      if (batch.fileHash !== input.fileHash) return fail("validation", OTHER_FILE_MESSAGE);

      const { teacherMap } = await loadMaps();
      const { timetable } = input.preview;
      const responsibles = new Map<string, string | null>();
      for (const lesson of timetable.lessons) {
        responsibles.set(lesson.id, responsibleOf(timetable, lesson.id, teacherMap));
      }
      const from = `${semester.start}T00:00`;
      const to = `${semester.end}T24:00`;
      const changed = await imports.setResponsibles(input.semesterId, from, to, responsibles);
      const current = await imports.listVersionOccupations(input.semesterId, from, to);
      const withoutResponsible = current.filter(
        (item) => item.status === "ativa" && item.responsibleUserId === null,
      ).length;
      return ok({ changed, withoutResponsible });
    },
  };
}

export type ImportService = ReturnType<typeof createImportService>;
