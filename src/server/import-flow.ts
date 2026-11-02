import type { ImportReportService } from "#/application/import-report";
import type { SemestersService } from "#/application/semesters";
import type { SpacesService } from "#/application/spaces";
import type { UsersService } from "#/application/users";
import { IMPORT_CHANGE_KINDS } from "#/domain/import-batch";
import type { Semester } from "#/domain/semester";
import {
  type AdminOutcome,
  BAD_REQUEST,
  fromResult,
  type RequestLike,
  record,
  reject,
  text,
} from "./admin-actions.ts";
import { asImporter, type ImportDeps } from "./import-actions.ts";
import { boundedInt, IMPORT_ROW_STATUSES, MAX_PAGE } from "./input.ts";

export type ImportFlowDeps = ImportDeps & {
  report: ImportReportService;
  spaces: SpacesService;
  semesters: SemestersService;
  users: UsersService;
};

/** O que a tela de importação precisa para os vínculos, sem expor e-mail nem papéis das contas. */
export type ImportTargets = {
  semesters: Semester[];
  spaces: Array<{ id: string; name: string }>;
  accounts: Array<{ id: string; name: string; code: string | null }>;
};

const MAX_SEARCH = 100;
const MAX_REASON = 60;

/** Semestres, espaços e contas ativas para escolher na importação (`admin` ou `horarios`). */
export function getImportTargets(
  deps: ImportFlowDeps,
  request: RequestLike,
): Promise<AdminOutcome<ImportTargets>> {
  return asImporter<ImportTargets>(deps, request, async () => {
    const [semesters, spaces, users] = await Promise.all([
      deps.semesters.list(),
      deps.spaces.list(),
      deps.users.list(),
    ]);
    return {
      ok: true,
      data: {
        semesters,
        spaces: spaces.map((space) => ({ id: space.id, name: space.name })),
        accounts: users
          .filter((user) => user.active)
          .map((user) => ({ id: user.id, name: user.name, code: user.code })),
      },
    };
  });
}

/** Cria um espaço a partir do nome de uma sala do arquivo (mesma regra do cadastro de espaços). */
export function createImportSpace(deps: ImportFlowDeps, request: RequestLike, data: unknown) {
  return asImporter<{ id: string; name: string }>(deps, request, async () => {
    const body = record(data);
    const name = body && text(body, "name");
    if (name === null || name === undefined) return reject(400, BAD_REQUEST);
    const result = fromResult(await deps.spaces.create({ name, capacity: null }));
    return result.ok ? { ok: true, data: { id: result.data.id, name: result.data.name } } : result;
  });
}

/** Linhas do lote com filtros por situação, motivo e texto, paginadas no servidor. */
export function getImportRows(deps: ImportFlowDeps, request: RequestLike, data: unknown) {
  return asImporter(deps, request, async () => {
    const body = record(data);
    const batchId = body && text(body, "batchId");
    if (!body || batchId === null || batchId === "") return reject(400, BAD_REQUEST);
    const rawStatus = body.status;
    const status = IMPORT_ROW_STATUSES.find((item) => item === rawStatus);
    if (rawStatus !== undefined && status === undefined) return reject(400, BAD_REQUEST);
    const rawKind = body.changeKind;
    const changeKind = IMPORT_CHANGE_KINDS.find((item) => item === rawKind);
    if (rawKind !== undefined && changeKind === undefined) return reject(400, BAD_REQUEST);
    const reasonCode = body.reasonCode;
    if (
      reasonCode !== undefined &&
      (typeof reasonCode !== "string" || reasonCode.length === 0 || reasonCode.length > MAX_REASON)
    ) {
      return reject(400, BAD_REQUEST);
    }
    const search = body.search;
    if (search !== undefined && (typeof search !== "string" || search.length > MAX_SEARCH)) {
      return reject(400, BAD_REQUEST);
    }
    const limit = boundedInt(body.limit, 1, MAX_PAGE);
    const offset = boundedInt(body.offset, 0, Number.MAX_SAFE_INTEGER);
    if (limit === null || offset === null) return reject(400, BAD_REQUEST);
    return fromResult(
      await deps.report.rows(batchId, {
        ...(status === undefined ? {} : { status }),
        ...(reasonCode === undefined ? {} : { reasonCode }),
        ...(search === undefined ? {} : { search }),
        ...(changeKind === undefined ? {} : { changeKind }),
        ...(limit === undefined ? {} : { limit }),
        ...(offset === undefined ? {} : { offset }),
      }),
    );
  });
}

export function listImportBatches(deps: ImportFlowDeps, request: RequestLike) {
  return asImporter(deps, request, async () => ({ ok: true, data: await deps.report.batches() }));
}
