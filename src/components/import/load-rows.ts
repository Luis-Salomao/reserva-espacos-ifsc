import { runAdminAction } from "#/components/admin/use-admin-action";
import { getImportRowsFn } from "#/server/import-fns";
import type { LoadRows } from "./batch-rows";

/** Carrega uma página de linhas do lote pela função de servidor (erros viram resultado tipado). */
export const loadImportRows: LoadRows = (query) =>
  runAdminAction(() => getImportRowsFn({ data: query }));
