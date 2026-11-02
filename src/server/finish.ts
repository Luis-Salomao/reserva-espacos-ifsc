import { setResponseHeader, setResponseStatus } from "@tanstack/react-start/server";
import type { AdminOutcome, AdminResponse } from "./admin-actions.ts";

/**
 * Fecha uma função de servidor: resposta sem cache, cookie renovado quando houver e HTTP 401/403
 * para sessão ausente ou papel errado; as demais falhas voltam no corpo, com HTTP 200.
 */
export function finish<T>(outcome: AdminOutcome<T>): AdminResponse<T> {
  setResponseHeader("Cache-Control", "no-store");
  if (outcome.setCookie !== null) setResponseHeader("Set-Cookie", outcome.setCookie);
  const { response } = outcome;
  if (!response.ok && (response.status === 401 || response.status === 403)) {
    setResponseStatus(response.status);
  }
  return response;
}
