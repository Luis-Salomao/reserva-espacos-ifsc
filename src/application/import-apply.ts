import type {
  Clock,
  ImportRepository,
  RoomMappingRepository,
  SemesterRepository,
  TeacherMappingRepository,
} from "#/application/ports";
import { fail, ok, type Result } from "#/application/validation";
import type {
  ImportBatch,
  ImportRow,
  ImportRowCounts,
  ImportRowStatus,
  ImportSummary,
} from "#/domain/import-batch";
import { IGNORE_ROOM, type ImportPlan, type PlanInput, planImport } from "./import-plan";

/** Linhas por bloco atômico: cada linha usa até 3 instruções, então um bloco tem ≤ 90 instruções. */
const ROWS_PER_CHUNK = 30;

const DEFAULT_REPORT_LIMIT = 200;
const MAX_REPORT_LIMIT = 1000;
const FAILURE_CODE = "erro_gravacao";
const FAILURE_DETAIL = "Não foi possível gravar este grupo de linhas. Aplique o lote novamente.";

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
  preview: PlanInput["preview"];
  actorId: string;
};

export type PrepareOutput = {
  batch: ImportBatch;
  /** `true` quando o mesmo arquivo já tinha lote neste semestre (nada novo é criado). */
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

function planRows(batchId: string, plan: ImportPlan): ImportRow[] {
  const rows: ImportRow[] = [];
  const occurrence = (
    draft: ImportPlan["toInsert"][number],
    extra: Pick<ImportRow, "status" | "reasonCode" | "reasonDetail" | "conflictOccupationId">,
  ): ImportRow => ({
    batchId,
    rowKey: draft.rowKey,
    lessonId: draft.lessonId,
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
      batchId,
      rowKey: item.rowKey,
      lessonId: item.lessonId,
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

function chunks<T>(items: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
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
     * Planeja e grava o lote como `rascunho` (linhas `pendente`, `nao_aplicavel`, `conflito`,
     * `conflito_interno`). Mesmo arquivo e semestre com lote já iniciado ou aplicado: devolve o
     * lote existente sem criar nada (idempotência). Um rascunho antigo é refeito com os vínculos atuais.
     */
    async prepare(input: PrepareInput): Promise<Result<PrepareOutput>> {
      const semester = await semesters.findById(input.semesterId);
      if (semester === null) return fail("not_found", "Semestre não encontrado.");
      const existing = await imports.findBatchByHash(input.semesterId, input.fileHash);
      if (existing !== null && existing.status !== "rascunho") {
        return ok({ batch: existing, reused: true });
      }
      if (existing !== null) await imports.deleteDraft(existing.id);

      const maps = await loadMaps();
      const occupied = await imports.listActiveOccupations(
        `${semester.start}T00:00`,
        `${semester.end}T24:00`,
      );
      const plan = planImport({
        preview: input.preview,
        semester,
        ...maps,
        existing: occupied,
      });
      const id = crypto.randomUUID();
      const rows = planRows(id, plan);
      const batch: ImportBatch = {
        id,
        semesterId: input.semesterId,
        fileHash: input.fileHash,
        summary: summarize(rows),
        status: "rascunho",
        createdBy: input.actorId,
        createdAt: clock.now().toISOString(),
        appliedAt: null,
      };
      try {
        await imports.createBatch(batch, rows);
      } catch (error) {
        // Outra requisição criou o mesmo lote ao mesmo tempo: usa o que ela gravou.
        const winner = await imports.findBatchByHash(input.semesterId, input.fileHash);
        if (winner === null) throw error;
        return ok({ batch: winner, reused: true });
      }
      return ok({ batch, reused: false });
    },

    /**
     * Aplica (ou retoma) o lote: `rascunho`/`falhou` → `aplicando` → `aplicado`. Insere em blocos
     * atômicos; ocupação sobreposta que surgiu depois da prévia vira linha `conflito`. Falha num bloco
     * marca as linhas dele como `falha` (motivo genérico), interrompe e deixa o lote `falhou`;
     * chamar de novo continua de onde parou, sem duplicar.
     */
    async apply(batchId: string): Promise<Result<ImportBatch>> {
      const batch = await imports.findBatch(batchId);
      if (batch === null) return fail("not_found", "Lote de importação não encontrado.");
      if (batch.status === "aplicado") return ok(batch);
      await imports.setBatchState(batchId, {
        status: "aplicando",
        summary: batch.summary,
        appliedAt: null,
      });
      const pending = await imports.pendingRows(batchId);
      const createdAt = clock.now().toISOString();
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
          break;
        }
      }
      const counts = await imports.countRows(batchId);
      const complete = counts.pendente + counts.falha === 0;
      await imports.setBatchState(batchId, {
        status: complete ? "aplicado" : "falhou",
        summary: { ...batch.summary, counts },
        appliedAt: complete ? clock.now().toISOString() : null,
      });
      const updated = await imports.findBatch(batchId);
      return updated === null
        ? fail("not_found", "Lote de importação não encontrado.")
        : ok(updated);
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
