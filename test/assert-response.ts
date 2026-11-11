import type { AdminResponse } from "#/server/admin-actions";

export function requireSuccess<T>(response: AdminResponse<T> | undefined): T {
  if (response === undefined || !response.ok) throw new Error("Esperada uma resposta de sucesso.");
  return response.data;
}

export function requireFailure<T>(response: AdminResponse<T> | undefined) {
  if (response === undefined || response.ok) throw new Error("Esperada uma resposta de falha.");
  return response;
}
