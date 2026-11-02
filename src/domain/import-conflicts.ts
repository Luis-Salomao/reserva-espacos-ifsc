export const BUSY_MESSAGE =
  "Há outro lote deste semestre em andamento (aplicando ou interrompido). Conclua-o, ou descarte-o se nada foi aplicado, antes de continuar.";

export const STALE_MESSAGE =
  "Outra versão da grade foi aplicada depois deste preparo. Envie o arquivo de novo para refazer a conferência.";

/** Qual conflito tipado o servidor devolveu ao preparar ou aplicar (a tela age diferente em cada um). */
export type ImportConflictKind = "busy" | "stale";

export function classifyImportConflict(message: string): ImportConflictKind | null {
  if (message === BUSY_MESSAGE) return "busy";
  if (message === STALE_MESSAGE) return "stale";
  return null;
}
