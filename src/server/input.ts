import type { ImportRowStatus } from "#/domain/import-batch";

/** Validador das server functions: a validação real é feita nas ações do servidor. */
export const passthrough = (data: unknown): unknown => data;

export const IMPORT_ROW_STATUSES: readonly ImportRowStatus[] = [
  "pendente",
  "aplicada",
  "nao_aplicavel",
  "conflito",
  "conflito_interno",
  "falha",
  "inalterada",
  "mantida_cancelada",
  "cancelar",
  "cancelada_versao",
  "responsavel",
  "responsavel_atualizado",
];

export const MAX_STEP = 100;
export const MAX_PAGE = 1000;

/** Inteiro em [min, max]; `undefined` quando ausente; `null` quando inválido. */
export function boundedInt(value: unknown, min: number, max: number): number | null | undefined {
  if (value === undefined) return undefined;
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max
    ? value
    : null;
}
