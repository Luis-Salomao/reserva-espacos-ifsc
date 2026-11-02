import { useEffect } from "react";
import type { AdminResponse } from "#/server/admin-actions";

export const ROLE_LABELS = {
  admin: "Administrador",
  horarios: "Horários",
  docente: "Docente",
} as const;

export const ROLE_OPTIONS = ["admin", "horarios", "docente"] as const;

const SESSION_ERROR =
  "Não foi possível concluir a ação. Sua sessão pode ter expirado ou faltar permissão; entre de novo.";

/** Executa uma função de servidor; erro de rede/401/403 vira resultado tipado com mensagem. */
export async function runAdminAction<T>(
  action: () => Promise<AdminResponse<T>>,
): Promise<AdminResponse<T>> {
  try {
    return await action();
  } catch {
    return { ok: false, status: 403, message: SESSION_ERROR };
  }
}

/** Mensagem do campo `field` quando a falha é dele; `undefined` caso contrário. */
export function fieldError<T>(result: AdminResponse<T> | null, field: string): string | undefined {
  return result !== null && !result.ok && result.field === field ? result.message : undefined;
}

/** Mensagem geral: falhas sem campo associado. */
export function generalError<T>(result: AdminResponse<T> | null): string | undefined {
  return result !== null && !result.ok && result.field === undefined ? result.message : undefined;
}

/**
 * Depois de uma falha ligada a um campo, leva o foco ao campo inválido (o id é `<uid>-<campo>`,
 * o mesmo usado pelos rótulos), para leitores de tela e teclado.
 */
export function useFocusInvalidField<T>(result: AdminResponse<T> | null, uid: string): void {
  useEffect(() => {
    if (result === null || result.ok || result.field === undefined) return;
    document.getElementById(`${uid}-${result.field}`)?.focus();
  }, [result, uid]);
}
