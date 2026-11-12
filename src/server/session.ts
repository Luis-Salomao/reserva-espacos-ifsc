import type { Role, User } from "#/domain/user";

/** Papéis que podem importar (e, depois, aplicar) a grade. */
export const IMPORT_ROLES: readonly Role[] = ["admin", "horarios"];

/** Papéis que podem fazer reservas avulsas. */
export const BOOKING_ROLES: readonly Role[] = ["admin", "horarios", "docente", "manutencao"];

/** Papéis que gerem a configuração dos semestres (o administrador também gere contas e espaços). */
export const SEMESTER_ROLES: readonly Role[] = ["admin", "horarios"];

/** Papéis que gerem contas e espaços. */
export const ADMIN_ROLES: readonly Role[] = ["admin"];

/** Papéis que podem atualizar capacidade, equipamentos e observações de espaços existentes. */
export const SPACE_INFO_ROLES: readonly Role[] = ["admin", "manutencao"];

export const SESSION_COOKIE = "sid";
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

/** `COOKIE_SECURE`: `auto` decide pela URL; `true`/`false` forçam o atributo Secure. */
export type CookieSecureMode = "auto" | "true" | "false";

/**
 * No modo `auto`, só `http://localhost` e `http://127.0.0.1` dispensam o atributo Secure do
 * cookie. `false` serve a rede local sem HTTPS (sem Secure) e `true` o força sempre.
 */
export function isSecureUrl(url: string, mode: CookieSecureMode = "auto"): boolean {
  if (mode === "true") return true;
  if (mode === "false") return false;
  const parsed = new URL(url);
  const local = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  return !(parsed.protocol === "http:" && local);
}

function cookie(value: string, maxAge: number, secure: boolean): string {
  const parts = [`${SESSION_COOKIE}=${value}`, `Max-Age=${maxAge}`, "Path=/", "HttpOnly"];
  if (secure) parts.push("Secure");
  parts.push("SameSite=Lax");
  return parts.join("; ");
}

/**
 * Valor de `Set-Cookie` para uma sessão nova ou renovada (7 dias).
 *
 * O Max-Age é renovado em TODA requisição autenticada (janela deslizante no navegador), mas a
 * sessão no banco só é estendida quando falta menos de 1 dia (`RENEW_BELOW_MS` em auth.ts). Logo,
 * o cookie pode viver além do `expires_at` do banco; isso é inofensivo, porque o servidor sempre
 * valida o token no banco (sessão expirada é recusada e apagada) e o cookie apenas fica inerte.
 */
export function buildSessionCookie(token: string, secure: boolean): string {
  if (!TOKEN_PATTERN.test(token)) throw new Error("Token de sessão em formato inválido.");
  return cookie(token, SESSION_MAX_AGE_SECONDS, secure);
}

/** Valor de `Set-Cookie` que apaga o cookie de sessão. */
export function buildClearedSessionCookie(secure: boolean): string {
  return cookie("", 0, secure);
}

/** Extrai o token do cabeçalho `Cookie`; `null` se ausente ou fora do formato esperado. */
export function parseSessionToken(header: string | null): string | null {
  if (header === null) return null;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() !== SESSION_COOKIE) continue;
    const value = part.slice(separator + 1).trim();
    return TOKEN_PATTERN.test(value) ? value : null;
  }
  return null;
}

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Origem aceita no `Origin`: `PUBLIC_ORIGIN`, se definida, senão a origem da própria requisição. */
export function allowedOrigin(requestUrl: string, publicOrigin?: string): string {
  return publicOrigin ?? new URL(requestUrl).origin;
}

/**
 * Proteção CSRF: toda requisição que altera estado precisa do cabeçalho `Origin` igual à origem
 * esperada (`PUBLIC_ORIGIN`, atrás de proxy reverso com TLS; senão a da própria requisição).
 * Não confia em `X-Forwarded-*`. Devolve a resposta 403 quando recusa, ou `null` quando pode seguir.
 */
export function csrfRejection(
  request: Pick<Request, "method" | "url" | "headers">,
  publicOrigin?: string,
): Response | null {
  if (!MUTATING_METHODS.has(request.method.toUpperCase())) return null;
  const origin = request.headers.get("origin");
  if (origin !== null && origin === allowedOrigin(request.url, publicOrigin)) return null;
  return new Response("Origem não permitida.", {
    status: 403,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

export type Authorization = { ok: true; user: User } | { ok: false; status: 401 | 403 };

/** Exige sessão (401) e ao menos um dos papéis (403). */
export function authorizeRoles(user: User | null, roles: readonly Role[]): Authorization {
  if (user === null) return { ok: false, status: 401 };
  if (!user.roles.some((role) => roles.includes(role))) return { ok: false, status: 403 };
  return { ok: true, user };
}

export type RouteAccess =
  | { kind: "allow" }
  | { kind: "login"; voltar: string }
  | { kind: "forbidden" };

/** Decisão para guardas de página: liberar, pedir login (com retorno) ou voltar ao início. */
export function decideRouteAccess(
  user: User | null,
  roles: readonly Role[],
  path: string,
): RouteAccess {
  const result = authorizeRoles(user, roles);
  if (result.ok) return { kind: "allow" };
  return result.status === 401 ? { kind: "login", voltar: path } : { kind: "forbidden" };
}

/** A página inicial é pública com PUBLIC_READ=true; senão exige sessão. */
export function canViewHome(publicRead: boolean, user: User | null): boolean {
  return publicRead || user !== null;
}

// biome-ignore lint/suspicious/noControlCharactersInRegex: recusa caracteres de controle de propósito
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/**
 * Destino de retorno pós-login: só caminho relativo do próprio site (começa com "/", não "//",
 * sem barra invertida nem controle). Qualquer outra coisa, ou a própria tela de login, vira "/".
 */
export function safeRedirectTarget(raw: string | null | undefined): string {
  if (raw === null || raw === undefined || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return "/";
  }
  if (raw.includes("\\") || decoded.includes("\\") || CONTROL_CHARS.test(decoded)) return "/";
  if (CONTROL_CHARS.test(raw) || decoded.startsWith("//")) return "/";
  const path = raw.split(/[?#]/, 1)[0] ?? "/";
  if (path === "/entrar" || path.startsWith("/api/")) return "/";
  return raw;
}

/** Sessão da requisição que o servidor entrega às páginas. */
/** `timeZone` é o TIMEZONE do servidor: o mesmo na renderização do servidor e no navegador. */
/** `unreadNotices`: avisos não lidos mais pedidos de sala esperando resposta (selo de Minhas reservas). */
export type SessionInfo = {
  user: User | null;
  publicRead: boolean;
  timeZone: string;
  unreadNotices?: number;
};
