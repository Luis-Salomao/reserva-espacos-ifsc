import type { LoginResult } from "#/application/auth";
import type { Role, User } from "#/domain/user";
import {
  authorizeRoles,
  buildClearedSessionCookie,
  buildSessionCookie,
  isSecureUrl,
  parseSessionToken,
  safeRedirectTarget,
} from "./session.ts";
import { checkContentLength, readBodyWithLimit } from "./upload-limit.ts";

/** O que o fluxo de login/logout precisa do serviço de autenticação (facilita os testes). */
export type AuthPort = {
  login(email: string, password: string): Promise<LoginResult>;
  authenticate(token: string): Promise<User | null>;
  logout(token: string): Promise<void>;
};

export const LOGIN_ERROR_MESSAGES = {
  invalido: "E-mail ou senha incorretos.",
  bloqueado: "Muitas tentativas. Tente novamente em alguns minutos.",
  falha: "Não foi possível entrar agora. Tente novamente em instantes.",
} as const;

export type LoginErrorCode = keyof typeof LOGIN_ERROR_MESSAGES;

/** Valida o parâmetro `erro` da URL: só códigos conhecidos (nunca texto vindo da URL). */
export function loginErrorFromSearch(value: unknown): LoginErrorCode | undefined {
  return value === "invalido" || value === "bloqueado" || value === "falha" ? value : undefined;
}

/** Resultado de um fluxo: para onde redirecionar e qual cookie gravar (se algum). */
export type Outcome = { location: string; setCookie: string | null };

function toRedirect(outcome: Outcome): Response {
  const headers = new Headers({ Location: outcome.location });
  if (outcome.setCookie !== null) headers.append("Set-Cookie", outcome.setCookie);
  return new Response(null, { status: 303, headers });
}

function loginFailure(code: LoginErrorCode, voltar: string): Outcome {
  const query = new URLSearchParams({ erro: code });
  if (voltar !== "/") query.set("voltar", voltar);
  return { location: `/entrar?${query.toString()}`, setCookie: null };
}

export type LoginInput = { email: string; password: string; voltar: string; url: string };

export async function processLogin(input: LoginInput, auth: AuthPort): Promise<Outcome> {
  const voltar = safeRedirectTarget(input.voltar);
  let result: LoginResult;
  try {
    result = await auth.login(input.email, input.password);
  } catch (error) {
    console.error("[entrar] falha:", error instanceof Error ? error.name : "erro");
    return loginFailure("falha", voltar);
  }
  if (!result.ok)
    return loginFailure(result.reason === "locked" ? "bloqueado" : "invalido", voltar);
  return {
    location: voltar,
    setCookie: buildSessionCookie(result.token, isSecureUrl(input.url)),
  };
}

const MAX_FORM_BYTES = 8 * 1024;

/** POST do formulário de login (urlencoded). Responde com redirecionamento 303. */
export async function handleLogin(request: Request, auth: AuthPort): Promise<Response> {
  const length = checkContentLength(request.headers, MAX_FORM_BYTES);
  if (!length.ok) return new Response(length.message, { status: length.status });
  const bytes = await readBodyWithLimit(request.body, MAX_FORM_BYTES);
  if (bytes === null) return new Response("Requisição grande demais.", { status: 413 });
  const form = new URLSearchParams(new TextDecoder().decode(bytes));
  const outcome = await processLogin(
    {
      email: form.get("email") ?? "",
      password: form.get("password") ?? "",
      voltar: form.get("voltar") ?? "",
      url: request.url,
    },
    auth,
  );
  return toRedirect(outcome);
}

export async function processLogout(
  token: string | null,
  url: string,
  auth: AuthPort,
): Promise<Outcome> {
  if (token !== null) await auth.logout(token);
  return { location: "/", setCookie: buildClearedSessionCookie(isSecureUrl(url)) };
}

/** POST de saída: revoga a sessão, apaga o cookie e volta ao início. */
export async function handleLogout(request: Request, auth: AuthPort): Promise<Response> {
  const token = parseSessionToken(request.headers.get("cookie"));
  return toRedirect(await processLogout(token, request.url, auth));
}

export type ResolvedSession = { user: User | null; setCookie: string | null };

/**
 * Usuário da sessão a partir do cabeçalho Cookie. Com sessão válida devolve também o Set-Cookie
 * que renova o prazo do cookie (a sessão no banco só é estendida quando falta menos de 1 dia).
 */
export async function resolveSession(
  cookieHeader: string | null,
  url: string,
  auth: AuthPort,
): Promise<ResolvedSession> {
  const token = parseSessionToken(cookieHeader);
  if (token === null) return { user: null, setCookie: null };
  const user = await auth.authenticate(token);
  if (user === null) return { user: null, setCookie: null };
  return { user, setCookie: buildSessionCookie(token, isSecureUrl(url)) };
}

export type RequiredRole =
  | { ok: true; user: User; setCookie: string | null }
  | { ok: false; response: Response };

/** Exige sessão e papel: 401 sem sessão, 403 com papel errado. Checagem sempre no servidor. */
export async function requireRole(
  request: Pick<Request, "url" | "headers">,
  auth: AuthPort,
  roles: readonly Role[],
): Promise<RequiredRole> {
  const { user, setCookie } = await resolveSession(
    request.headers.get("cookie"),
    request.url,
    auth,
  );
  const result = authorizeRoles(user, roles);
  if (result.ok) return { ok: true, user: result.user, setCookie };
  const message = result.status === 401 ? "É preciso entrar." : "Sem permissão para esta ação.";
  return { ok: false, response: Response.json({ ok: false, message }, { status: result.status }) };
}
