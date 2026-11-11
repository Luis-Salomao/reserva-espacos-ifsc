import { redirect } from "@tanstack/react-router";
import {
  ADMIN_ROLES,
  decideRouteAccess,
  IMPORT_ROLES,
  SEMESTER_ROLES,
  type SessionInfo,
  SPACE_INFO_ROLES,
} from "#/server/session";

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

/**
 * Guarda da página de manutenção de espaços (`admin` ou `manutencao`): sem sessão vai ao login e
 * volta para o caminho; com outro papel a navegação segue (a página mostra uma mensagem de
 * acesso negado, sem redirecionar). A checagem de verdade fica nas funções de servidor.
 */
export function guardSpaceInfo(context: { session: SessionInfo }, path: string): void {
  const access = decideRouteAccess(context.session.user, SPACE_INFO_ROLES, path);
  if (access.kind === "login") throw redirect({ to: "/entrar", search: { voltar: access.voltar } });
}

/**
 * Guarda das páginas de importação (`admin` ou `horarios`). Como protege também as rotas filhas,
 * o retorno pós-login é o caminho (e a consulta) realmente pedido, não o da raiz `/importar`.
 */
export function guardImport(
  context: { session: SessionInfo },
  location: { pathname: string; searchStr?: string },
): void {
  const path = `${location.pathname}${location.searchStr ?? ""}`;
  const access = decideRouteAccess(context.session.user, IMPORT_ROLES, path);
  if (access.kind === "login") throw redirect({ to: "/entrar", search: { voltar: access.voltar } });
  if (access.kind === "forbidden") throw redirect({ to: "/" });
}
