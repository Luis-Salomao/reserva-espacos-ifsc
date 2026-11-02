import type {
  ImportRepository,
  ReasonCount,
  RowFilter,
  SemesterRepository,
  SpaceRepository,
  UserRepository,
} from "#/application/ports";
import { fail, ok, type Result } from "#/application/validation";
import type { ImportBatch, ImportRowStatus, ImportSummary } from "#/domain/import-batch";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const MAX_BATCHES = 100;
const HASH_PREFIX = 8;

/** Lote para a tela: só o prefixo do hash identifica o arquivo (o nome nunca é guardado). */
export type BatchView = {
  id: string;
  semesterId: string;
  semesterName: string;
  status: ImportBatch["status"];
  createdAt: string;
  appliedAt: string | null;
  hashPrefix: string;
  summary: ImportSummary;
};

export type RowView = {
  rowKey: string;
  weekday: number | null;
  date: string | null;
  startTime: string;
  endTime: string;
  spaceName: string | null;
  title: string;
  responsibleName: string | null;
  status: ImportRowStatus;
  reasonCode: string | null;
  reasonDetail: string | null;
  /** Ocupação que impediu a linha (conflito com ocupação existente ou surgida na aplicação). */
  conflictWith: { title: string; startsAt: string; endsAt: string } | null;
};

export type RowsPage = {
  batch: BatchView;
  total: number;
  limit: number;
  offset: number;
  rows: RowView[];
  reasons: ReasonCount[];
};

export type ReportFilter = RowFilter & { limit?: number; offset?: number };

export function createImportReportService(deps: {
  imports: ImportRepository;
  spaces: SpaceRepository;
  users: UserRepository;
  semesters: SemesterRepository;
}) {
  const { imports, spaces, users, semesters } = deps;

  async function semesterNames(): Promise<Map<string, string>> {
    return new Map((await semesters.list()).map((semester) => [semester.id, semester.name]));
  }

  function toView(batch: ImportBatch, names: Map<string, string>): BatchView {
    return {
      id: batch.id,
      semesterId: batch.semesterId,
      semesterName: names.get(batch.semesterId) ?? "Semestre removido",
      status: batch.status,
      createdAt: batch.createdAt,
      appliedAt: batch.appliedAt,
      hashPrefix: batch.fileHash.slice(0, HASH_PREFIX),
      summary: batch.summary,
    };
  }

  return {
    /** Página de linhas do lote com filtros, total e contagem por motivo (também lote já aplicado). */
    async rows(batchId: string, filter: ReportFilter): Promise<Result<RowsPage>> {
      const batch = await imports.findBatch(batchId);
      if (batch === null) return fail("not_found", "Lote de importação não encontrado.");
      const limit = Math.min(Math.max(filter.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
      const offset = Math.max(filter.offset ?? 0, 0);
      const where: RowFilter = {
        ...(filter.status === undefined ? {} : { status: filter.status }),
        ...(filter.reasonCode === undefined ? {} : { reasonCode: filter.reasonCode }),
        ...(filter.search === undefined ? {} : { search: filter.search }),
      };
      const [rows, total, reasons, names, allSpaces, accounts] = await Promise.all([
        imports.listRows(batchId, { ...where, limit, offset }),
        imports.countFilteredRows(batchId, where),
        imports.reasonCounts(batchId),
        semesterNames(),
        spaces.list(),
        users.list(),
      ]);
      const conflictIds = rows
        .map((row) => row.conflictOccupationId)
        .filter((id): id is string => id !== null);
      const occupations = new Map(
        (await imports.describeOccupations([...new Set(conflictIds)])).map((item) => [
          item.id,
          item,
        ]),
      );
      const spaceNames = new Map(allSpaces.map((space) => [space.id, space.name]));
      const userNames = new Map(accounts.map((user) => [user.id, user.name]));
      return ok({
        batch: toView(batch, names),
        total,
        limit,
        offset,
        reasons,
        rows: rows.map((row) => {
          const other =
            row.conflictOccupationId === null
              ? undefined
              : occupations.get(row.conflictOccupationId);
          return {
            rowKey: row.rowKey,
            weekday: row.weekday,
            date: row.date,
            startTime: row.startTime,
            endTime: row.endTime,
            spaceName: row.spaceId === null ? null : (spaceNames.get(row.spaceId) ?? null),
            title: row.title,
            responsibleName:
              row.responsibleUserId === null
                ? null
                : (userNames.get(row.responsibleUserId) ?? null),
            status: row.status,
            reasonCode: row.reasonCode,
            reasonDetail: row.reasonDetail,
            conflictWith:
              other === undefined
                ? null
                : { title: other.title, startsAt: other.startsAt, endsAt: other.endsAt },
          };
        }),
      });
    },

    /** Lotes do mais recente para o mais antigo, com semestre, estado e contagens. */
    async batches(): Promise<BatchView[]> {
      const [list, names] = await Promise.all([imports.listBatches(MAX_BATCHES), semesterNames()]);
      return list.map((batch) => toView(batch, names));
    },
  };
}

export type ImportReportService = ReturnType<typeof createImportReportService>;
