import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createImportService } from "#/application/import-apply";
import { createMappingsService } from "#/application/import-mappings";
import { createImportReportService } from "#/application/import-report";
import { createImportRepository } from "#/infra/db/repos/import-repository";
import { createMappingRepositories } from "#/infra/db/repos/mapping-repositories";
import { createSemesterRepository } from "#/infra/db/repos/semester-repository";
import { createSpaceRepository } from "#/infra/db/repos/space-repository";
import { createUserRepository } from "#/infra/db/repos/user-repository";
import { systemClock } from "#/infra/runtime";
import { getDb } from "#db-client";
import { finish, getAdminDeps } from "./admin.ts";
import {
  applyImportBatch,
  saveRoomMappings,
  saveTeacherMappings,
  suggestMappings,
} from "./import-actions.ts";
import {
  createImportSpace,
  getImportRows,
  getImportTargets,
  type ImportFlowDeps,
  listImportBatches,
} from "./import-flow.ts";

/**
 * Funções de servidor da importação (`admin` ou `horarios`, checado em cada ação). O preparo do
 * lote não é uma função de servidor porque recebe o XML (bytes): vai por `/api/import-prepare`.
 */
export function getImportFlowDeps(): ImportFlowDeps {
  const admin = getAdminDeps();
  const db = getDb();
  const spaces = createSpaceRepository(db);
  const users = createUserRepository(db);
  const semesters = createSemesterRepository(db);
  const maps = createMappingRepositories(db);
  const imports = createImportRepository(db);
  return {
    ...admin,
    imports: createImportService({
      imports,
      rooms: maps.rooms,
      teachers: maps.teachers,
      semesters,
      clock: systemClock,
    }),
    mappings: createMappingsService({
      rooms: maps.rooms,
      teachers: maps.teachers,
      spaces,
      users,
      clock: systemClock,
    }),
    report: createImportReportService({ imports, spaces, users, semesters }),
  };
}

const passthrough = (data: unknown): unknown => data;

export const getImportTargetsFn = createServerFn({ method: "GET" }).handler(async () =>
  finish(await getImportTargets(getImportFlowDeps(), getRequest())),
);

export const suggestMappingsFn = createServerFn({ method: "POST" })
  .validator(passthrough)
  .handler(async ({ data }) =>
    finish(await suggestMappings(getImportFlowDeps(), getRequest(), data)),
  );

export const saveRoomMappingsFn = createServerFn({ method: "POST" })
  .validator(passthrough)
  .handler(async ({ data }) =>
    finish(await saveRoomMappings(getImportFlowDeps(), getRequest(), data)),
  );

export const saveTeacherMappingsFn = createServerFn({ method: "POST" })
  .validator(passthrough)
  .handler(async ({ data }) =>
    finish(await saveTeacherMappings(getImportFlowDeps(), getRequest(), data)),
  );

export const createImportSpaceFn = createServerFn({ method: "POST" })
  .validator(passthrough)
  .handler(async ({ data }) =>
    finish(await createImportSpace(getImportFlowDeps(), getRequest(), data)),
  );

export const applyImportBatchFn = createServerFn({ method: "POST" })
  .validator(passthrough)
  .handler(async ({ data }) =>
    finish(await applyImportBatch(getImportFlowDeps(), getRequest(), data)),
  );

export const getImportRowsFn = createServerFn({ method: "POST" })
  .validator(passthrough)
  .handler(async ({ data }) =>
    finish(await getImportRows(getImportFlowDeps(), getRequest(), data)),
  );

export const listImportBatchesFn = createServerFn({ method: "GET" }).handler(async () =>
  finish(await listImportBatches(getImportFlowDeps(), getRequest())),
);
