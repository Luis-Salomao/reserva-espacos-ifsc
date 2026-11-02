import type {
  Clock,
  ImportRepository,
  RoomMappingRepository,
  SemesterRepository,
  TeacherMappingRepository,
} from "#/application/ports";
import { fail, ok, type Result } from "#/application/validation";
import { weekdayOf } from "#/domain/calendar";
import type {
  ImportBatch,
  ImportRow,
  ImportRowCounts,
  ImportRowStatus,
  ImportSummary,
} from "#/domain/import-batch";
import { IGNORE_ROOM, type ImportPlan, type PlanInput, planImport } from "./import-plan";

/** Linhas por bloco atômico de aplicação: cada linha usa até 3 instruções, então ≤ 90 instruções. */
const ROWS_PER_CHUNK = 30;
/** Linhas por chamada de gravação do rascunho (uma instrução por linha; o D1 limita parâmetros). */
const ROWS_PER_WRITE = 50;
/**
 * Orçamento por chamada (o Workers limita as consultas por invocação; ~50 no plano Free). Conta:
 * `prepare` gasta ~8 consultas fixas (vínculos x2, ocupações, semestre, lote por hash, inserir
 * lote, chaves, contagem e fechar) + até `maxCalls` gravações de 50 linhas = 38 com o padrão 30
 * (1500 linhas). `apply` gasta ~6 fixas (lote, contagem, estado, pendentes, contagem, estado) +
 * até `maxChunks` blocos de 30 linhas = 36 com o padrão 30 (900 linhas). NÃO verificado: se o D1
 * conta cada instrução de um `batch` separadamente; se contar, reduza os padrões.
 */
const DEFAULT_PREPARE_CALLS = 30;
const DEFAULT_APPLY_CHUNKS = 30;

const DEFAULT_REPORT_LIMIT = 200;
const MAX_REPORT_LIMIT = 1000;
const FAILURE_CODE = "erro_gravacao";
const FAILURE_DETAIL = "Não foi possível gravar este grupo de linhas. Aplique o lote novamente.";
const PARTIAL_MESSAGE =
  "O arquivo foi lido só em parte (cards demais); a importação foi recusada para não gerar um lote incompleto.";
const CHANGED_MESSAGE =
  "O lote foi alterado por outra operação enquanto esta rodava. Recarregue e tente de novo.";
const PREPARING_MESSAGE = "O lote ainda está sendo preparado. Conclua o preparo antes de aplicar.";
const INCOMPLETE_MESSAGE =
  "O lote está incompleto (faltam linhas). Envie o arquivo de novo para refazer o preparo.";

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

export type PrepareOutput = StepOutput & {
  /** `true` quando o mesmo arquivo já tinha lote concluído neste semestre (nada novo é criado). */
  reused: boolean;
};

export type ReportOptions = { status?: ImportRowStatus; limit?: number; offset?: number };

const EMPTY_COUNTS: ImportRowCounts = {
  pendente: 0,
  aplicada: 0,
  nao_aplicavel: 0,
  conflito: 0,
  conflito_interno: 0,
  falha: 0,
};

function timePart(startsAt: string): string {
  return startsAt.slice(11);
}

/** Linhas do plano sem lote (`batchId` vazio): o chamador carimba o id do lote que vale. */
function planRows(plan: ImportPlan): ImportRow[] {
  const rows: ImportRow[] = [];
  const occurrence = (
    draft: ImportPlan["toInsert"][number],
    extra: Pick<ImportRow, "status" | "reasonCode" | "reasonDetail" | "conflictOccupationId">,
  ): ImportRow => ({
    batchId: "",
    rowKey: draft.rowKey,
    lessonId: draft.lessonId,
    weekday: weekdayOf(draft.startsAt.slice(0, 10)),
    spaceId: draft.spaceId,
    date: draft.startsAt.slice(0, 10),
    startTime: timePart(draft.startsAt),
    endTime: timePart(draft.endsAt),
    title: draft.title,
    responsibleUserId: draft.responsibleUserId,
    occupationId: null,
    ...extra,
  });
  for (const draft of plan.toInsert) {
    rows.push(
      occurrence(draft, {
        status: "pendente",
        reasonCode: null,
        reasonDetail: null,
        conflictOccupationId: null,
      }),
    );
  }
  for (const { draft, existingId } of plan.conflicts) {
    rows.push(
      occurrence(draft, {
        status: "conflito",
        reasonCode: "conflito_existente",
        reasonDetail: "Já existe uma ocupação ativa neste espaço e horário.",
        conflictOccupationId: existingId,
      }),
    );
  }
  for (const { draft } of plan.internalConflicts) {
    rows.push(
      occurrence(draft, {
        status: "conflito_interno",
        reasonCode: "conflito_interno",
        reasonDetail: "Outra aula do mesmo arquivo ocupa o mesmo espaço e horário.",
        conflictOccupationId: null,
      }),
    );
  }
  for (const item of plan.notApplicable) {
    rows.push({
      batchId: "",
      rowKey: item.rowKey,
      lessonId: item.lessonId,
      weekday: item.weekday,
      spaceId: null,
      date: null,
      startTime: item.start,
      endTime: item.end,
      title: item.title,
      responsibleUserId: null,
      status: "nao_aplicavel",
      reasonCode: item.reason,
      reasonDetail: item.detail,
      occupationId: null,
      conflictOccupationId: null,
    });
  }
  return rows;
}

function summarize(rows: readonly ImportRow[]): ImportSummary {
  const counts: ImportRowCounts = { ...EMPTY_COUNTS };
  const notApplicable: Record<string, number> = {};
  for (const row of rows) {
    counts[row.status] += 1;
    if (row.status === "nao_aplicavel" && row.reasonCode !== null) {
      notApplicable[row.reasonCode] = (notApplicable[row.reasonCode] ?? 0) + 1;
    }
  }
  return { rows: rows.length, notApplicable, counts };
}

/** SHA-256 do conteúdo canônico das linhas planejadas (chave, situação, motivo, espaço, horários, responsável, título). */
async function fingerprint(rows: readonly ImportRow[]): Promise<string> {
  const canonical = [...rows]
    .sort((x, y) => (x.rowKey < y.rowKey ? -1 : x.rowKey > y.rowKey ? 1 : 0))
    .map((row) => [
      row.rowKey,
      row.status,
      row.reasonCode,
      row.conflictOccupationId,
      row.spaceId,
      row.date,
      row.startTime,
      row.endTime,
      row.weekday,
      row.responsibleUserId,
      row.title,
    ]);
  return hashImportFile(new TextEncoder().encode(JSON.stringify(canonical)));
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
     * Prepara o lote em passos (cada chamada grava no máximo `maxCalls` blocos de 50 linhas).
     * Estados: `preparando` (linhas sendo gravadas) → `rascunho` (completo e conferido: linhas ==
     * resumo). Um lote `preparando` do mesmo (arquivo, semestre) é retomado, nunca reutilizado;
     * se as linhas gravadas não são do plano atual, é apagado e refeito. Lote `aplicando`,
     * `aplicado` ou `falhou` é devolvido como está (`reused`). Um `rascunho` é refeito com os
     * vínculos atuais. Prévia truncada é recusada.
     */
    async prepare(
      input: PrepareInput,
      options: { maxCalls?: number } = {},
    ): Promise<Result<PrepareOutput>> {
      if (input.preview.partial) return fail("validation", PARTIAL_MESSAGE);
      const semester = await semesters.findById(input.semesterId);
      if (semester === null) return fail("not_found", "Semestre não encontrado.");

      const maps = await loadMaps();
      const occupied = await imports.listActiveOccupations(
        `${semester.start}T00:00`,
        `${semester.end}T24:00`,
      );
      const plan = planImport({ preview: input.preview, semester, ...maps, existing: occupied });
      const planned = planRows(plan);
      const summary = summarize(planned);
      const planHash = await fingerprint(planned);
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
        // O plano mudou (vínculos, conflitos, motivos) ou há linhas que não são dele: refaz do zero.
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
     * Recusa lote `preparando` ou cujas linhas não batem com o resumo. Parar pelo orçamento deixa o
     * lote `aplicando` (retomável); `falhou` só ocorre em erro real de gravação (as linhas do
     * bloco viram `falha`, motivo genérico). Ocupação sobreposta surgida depois da prévia vira
     * linha `conflito`. Chamar de novo continua de onde parou, sem duplicar.
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
        const started = await imports.transition(batchId, ["rascunho", "falhou"], {
          status: "aplicando",
          appliedAt: null,
        });
        if (!started) return fail("conflict", CHANGED_MESSAGE);
      }
      const chunkBudget = options.maxChunks ?? DEFAULT_APPLY_CHUNKS;
      const pending = await imports.pendingRows(batchId, chunkBudget * ROWS_PER_CHUNK);
      const createdAt = clock.now().toISOString();
      let errored = false;
      for (const group of chunks(pending, ROWS_PER_CHUNK)) {
        try {
          await imports.applyRows(batchId, group, createdAt);
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
      }
      const counts = await imports.countRows(batchId);
      const remaining = counts.pendente + counts.falha;
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

    /** Lote e suas linhas (filtráveis por situação), para o usuário ver o que deu errado. */
    async report(
      batchId: string,
      options: ReportOptions,
    ): Promise<Result<{ batch: ImportBatch; rows: ImportRow[] }>> {
      const batch = await imports.findBatch(batchId);
      if (batch === null) return fail("not_found", "Lote de importação não encontrado.");
      const limit = Math.min(Math.max(options.limit ?? DEFAULT_REPORT_LIMIT, 1), MAX_REPORT_LIMIT);
      const rows = await imports.listRows(batchId, {
        ...(options.status === undefined ? {} : { status: options.status }),
        limit,
        offset: Math.max(options.offset ?? 0, 0),
      });
      return ok({ batch, rows });
    },
  };
}

export type ImportService = ReturnType<typeof createImportService>;
