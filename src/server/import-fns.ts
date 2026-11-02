import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { finish } from "./finish.ts";
import {
  applyImportBatch,
  saveRoomMappings,
  saveTeacherMappings,
  suggestMappings,
} from "./import-actions.ts";
import { getImportFlowDeps } from "./import-deps.ts";
import {
  createImportSpace,
  getImportRows,
  getImportTargets,
  listImportBatches,
} from "./import-flow.ts";

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
