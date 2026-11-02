import { redirect } from "@tanstack/react-router";
import { ADMIN_ROLES, decideRouteAccess, SEMESTER_ROLES, type SessionInfo } from "#/server/session";

/**
 * Guarda das páginas de administração (só `admin`): sem sessão vai ao login e volta para o
 * caminho; com outro papel volta ao início. A checagem de verdade fica nas funções de servidor.
 */
export function guardAdmin(context: { session: SessionInfo }, path: string): void {
  const access = decideRouteAccess(context.session.user, ADMIN_ROLES, path);
  if (access.kind === "login") throw redirect({ to: "/entrar", search: { voltar: access.voltar } });
  if (access.kind === "forbidden") throw redirect({ to: "/" });
}

/** Guarda das páginas de semestres (`admin` ou `horarios`), com o mesmo comportamento. */
export function guardSemesters(context: { session: SessionInfo }, path: string): void {
  const access = decideRouteAccess(context.session.user, SEMESTER_ROLES, path);
  if (access.kind === "login") throw redirect({ to: "/entrar", search: { voltar: access.voltar } });
  if (access.kind === "forbidden") throw redirect({ to: "/" });
}
