/**
 * Por que uma ocupação foi cancelada (`occupations.cancel_reason`). Valores gravados no banco:
 * não renomeie. A Fase 2 (cancelamento por pessoas) reutiliza esta lista.
 */
export const CANCEL_REASONS = {
  /** Substituída por uma nova versão da grade importada. */
  novaVersao: "nova_versao",
  /** Cancelada à mão por uma pessoa. */
  usuario: "usuario",
} as const;
