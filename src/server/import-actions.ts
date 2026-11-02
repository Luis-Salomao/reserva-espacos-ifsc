import {
  hashImportFile,
  type ImportService,
  type PrepareOutput,
  type StepOutput,
} from "#/application/import-apply";
import type { MappingsService } from "#/application/import-mappings";
import type { ImportBatch, ImportRow, ImportRowStatus } from "#/domain/import-batch";
import { previewAscXml } from "#/import-asc/index.ts";
import {
  type AdminOutcome,
  type AdminResponse,
  asRoles,
  BAD_REQUEST,
  fromResult,
  type RequestLike,
  record,
  reject,
  text,
} from "./admin-actions.ts";
import type { AuthPort } from "./auth-handlers.ts";
import { type CookieSecureMode, IMPORT_ROLES } from "./session.ts";

export type ImportDeps = {
  auth: AuthPort;
  imports: ImportService;
  mappings: MappingsService;
  cookieSecure: CookieSecureMode;
};

export const STATUSES: readonly ImportRowStatus[] = [
  "pendente",
  "aplicada",
  "nao_aplicavel",
  "conflito",
  "conflito_interno",
  "falha",
];

export function asImporter<T>(
  deps: ImportDeps,
  request: RequestLike,
  run: (actorId: string) => Promise<AdminResponse<T>>,
): Promise<AdminOutcome<T>> {
  return asRoles(IMPORT_ROLES, deps, request, (actor) => run(actor.id));
}

const MAX_STEP = 100;
export const MAX_PAGE = 1000;

/** Inteiro em [min, max]; `undefined` quando ausente; `null` quando inválido. */
export function boundedInt(value: unknown, min: number, max: number): number | null | undefined {
  if (value === undefined) return undefined;
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max
    ? value
    : null;
}

function objects(data: Record<string, unknown>, key: string): Record<string, unknown>[] | null {
  const value = data[key];
  if (!Array.isArray(value)) return null;
  const items = value.map(record);
  return items.every((item) => item !== null) ? (items as Record<string, unknown>[]) : null;
}

/** Sugestões de vínculo para as salas e os docentes da prévia (`admin` ou `horarios`). */
export function suggestMappings(deps: ImportDeps, request: RequestLike, data: unknown) {
  return asImporter(deps, request, async () => {
    const body = record(data);
    const classrooms = body && objects(body, "classrooms");
    const teachers = body && objects(body, "teachers");
    if (!body || !classrooms || !teachers) return reject(400, BAD_REQUEST);
    const rooms: Array<{ id: string; short: string; name: string }> = [];
    for (const item of classrooms) {
      const id = text(item, "id");
      const short = text(item, "short");
      const name = text(item, "name");
      if (id === null || short === null || name === null) return reject(400, BAD_REQUEST);
      rooms.push({ id, short, name });
    }
    const people: Array<{ id: string; short: string }> = [];
    for (const item of teachers) {
      const id = text(item, "id");
      const short = text(item, "short");
      if (id === null || short === null) return reject(400, BAD_REQUEST);
      people.push({ id, short });
    }
    return {
      ok: true,
      data: {
        rooms: await deps.mappings.suggestRooms(rooms),
        teachers: await deps.mappings.suggestTeachers(people),
      },
    };
  });
}

export function saveRoomMappings(deps: ImportDeps, request: RequestLike, data: unknown) {
  return asImporter<null>(deps, request, async () => {
    const body = record(data);
    const items = body && objects(body, "items");
    if (!items) return reject(400, BAD_REQUEST);
    const mappings = [];
    for (const item of items) {
      const sourceRoomId = text(item, "sourceRoomId");
      const sourceShort = text(item, "sourceShort");
      const spaceId = item.spaceId === null ? null : text(item, "spaceId");
      if (
        sourceRoomId === null ||
        sourceShort === null ||
        (item.spaceId !== null && spaceId === null) ||
        typeof item.ignored !== "boolean"
      ) {
        return reject(400, BAD_REQUEST);
      }
      mappings.push({ sourceRoomId, sourceShort, spaceId, ignored: item.ignored });
    }
    return fromResult(await deps.mappings.saveRooms(mappings));
  });
}

export function saveTeacherMappings(deps: ImportDeps, request: RequestLike, data: unknown) {
  return asImporter<null>(deps, request, async () => {
    const body = record(data);
    const items = body && objects(body, "items");
    if (!items) return reject(400, BAD_REQUEST);
    const mappings = [];
    for (const item of items) {
      const sourceTeacherId = text(item, "sourceTeacherId");
      const sourceShort = text(item, "sourceShort");
      const userId = item.userId === null ? null : text(item, "userId");
      if (
        sourceTeacherId === null ||
        sourceShort === null ||
        (item.userId !== null && userId === null)
      ) {
        return reject(400, BAD_REQUEST);
      }
      mappings.push({ sourceTeacherId, sourceShort, userId });
    }
    return fromResult(await deps.mappings.saveTeachers(mappings));
  });
}

/**
 * Lê o XML (bytes), calcula o hash e prepara o lote do semestre (nada vira ocupação ainda). O
 * mesmo arquivo no mesmo semestre devolve o lote existente (`reused`).
 */
export function prepareImport(
  deps: ImportDeps,
  request: RequestLike,
  semesterId: string,
  bytes: Uint8Array,
  maxCalls?: number,
) {
  return asImporter<PrepareOutput>(deps, request, async (actorId) => {
    if (semesterId === "" || bytes.byteLength === 0) return reject(400, BAD_REQUEST);
    if (maxCalls !== undefined && boundedInt(maxCalls, 1, MAX_STEP) === null) {
      return reject(400, BAD_REQUEST);
    }
    const parsed = previewAscXml(bytes);
    if (!parsed.ok) return reject(400, parsed.error.message);
    return fromResult(
      await deps.imports.prepare(
        {
          semesterId,
          fileHash: await hashImportFile(bytes),
          preview: parsed.preview,
          actorId,
        },
        maxCalls === undefined ? {} : { maxCalls },
      ),
    );
  });
}

export function applyImportBatch(deps: ImportDeps, request: RequestLike, data: unknown) {
  return asImporter<StepOutput>(deps, request, async () => {
    const body = record(data);
    const batchId = body && text(body, "batchId");
    if (batchId === null || batchId === undefined || batchId === "") {
      return reject(400, BAD_REQUEST);
    }
    const maxChunks = boundedInt(body?.maxChunks, 1, MAX_STEP);
    if (maxChunks === null) return reject(400, BAD_REQUEST);
    return fromResult(
      await deps.imports.apply(batchId, maxChunks === undefined ? {} : { maxChunks }),
    );
  });
}

export function getImportReport(deps: ImportDeps, request: RequestLike, data: unknown) {
  return asImporter<{ batch: ImportBatch; rows: ImportRow[] }>(deps, request, async () => {
    const body = record(data);
    const batchId = body && text(body, "batchId");
    if (batchId === null || batchId === undefined || batchId === "") {
      return reject(400, BAD_REQUEST);
    }
    const rawStatus = body?.status;
    const status = STATUSES.find((item) => item === rawStatus);
    if (rawStatus !== undefined && status === undefined) return reject(400, BAD_REQUEST);
    const limit = boundedInt(body?.limit, 1, MAX_PAGE);
    const offset = boundedInt(body?.offset, 0, Number.MAX_SAFE_INTEGER);
    if (limit === null || offset === null) return reject(400, BAD_REQUEST);
    return fromResult(
      await deps.imports.report(batchId, {
        ...(status === undefined ? {} : { status }),
        ...(limit === undefined ? {} : { limit }),
        ...(offset === undefined ? {} : { offset }),
      }),
    );
  });
}
