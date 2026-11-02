import type { SpacesService } from "#/application/spaces";
import type { UsersService } from "#/application/users";
import type { Failure, Result } from "#/application/validation";
import type { Space } from "#/domain/space";
import type { User } from "#/domain/user";
import { type AuthPort, resolveSession } from "./auth-handlers.ts";
import { ADMIN_ROLES, authorizeRoles, type CookieSecureMode } from "./session.ts";

export type AdminDeps = {
  auth: AuthPort;
  users: UsersService;
  spaces: SpacesService;
  cookieSecure: CookieSecureMode;
};

export type AdminStatus = 400 | 401 | 403 | 404 | 409;

/** Resposta serializável das ações administrativas (sempre HTTP 200 no corpo; o status vai à parte). */
export type AdminResponse<T> =
  | { ok: true; data: T }
  | { ok: false; status: AdminStatus; message: string; field?: string };

export type AdminOutcome<T> = { response: AdminResponse<T>; setCookie: string | null };

type RequestLike = Pick<Request, "url" | "headers">;

const STATUS_BY_KIND: Record<Failure["kind"], AdminStatus> = {
  validation: 400,
  conflict: 409,
  not_found: 404,
  last_admin: 409,
};

const BAD_REQUEST = "Requisição inválida.";

function reject(status: AdminStatus, message: string, field?: string): AdminResponse<never> {
  return field === undefined
    ? { ok: false, status, message }
    : { ok: false, status, message, field };
}

function fromResult<T>(result: Result<T>): AdminResponse<T> {
  if (result.ok) return { ok: true, data: result.value };
  return reject(STATUS_BY_KIND[result.kind], result.message, result.field);
}

/**
 * Exige sessão e papel `admin` no servidor (401 sem sessão, 403 com outro papel) antes de qualquer
 * ação; a checagem não depende da tela.
 */
async function asAdmin<T>(
  deps: AdminDeps,
  request: RequestLike,
  run: (actor: User) => Promise<AdminResponse<T>>,
): Promise<AdminOutcome<T>> {
  const { user, setCookie } = await resolveSession(
    request.headers.get("cookie"),
    request.url,
    deps.auth,
    deps.cookieSecure,
  );
  const access = authorizeRoles(user, ADMIN_ROLES);
  if (!access.ok) {
    const message = access.status === 401 ? "É preciso entrar." : "Sem permissão para esta ação.";
    return { response: reject(access.status, message), setCookie: null };
  }
  return { response: await run(access.user), setCookie };
}

function record(data: unknown): Record<string, unknown> | null {
  return typeof data === "object" && data !== null && !Array.isArray(data)
    ? (data as Record<string, unknown>)
    : null;
}

function text(data: Record<string, unknown>, key: string): string | null {
  const value = data[key];
  return typeof value === "string" ? value : null;
}

function textList(data: Record<string, unknown>, key: string): string[] | null {
  const value = data[key];
  if (!Array.isArray(value)) return null;
  return value.every((item) => typeof item === "string") ? (value as string[]) : null;
}

function capacity(data: Record<string, unknown>): string | number | null | undefined {
  const value = data.capacity;
  if (value === null || typeof value === "string" || typeof value === "number") return value;
  return undefined;
}

export function listAccounts(deps: AdminDeps, request: RequestLike) {
  return asAdmin(deps, request, async () => ({ ok: true, data: await deps.users.list() }));
}

export function createAccount(deps: AdminDeps, request: RequestLike, data: unknown) {
  return asAdmin<User>(deps, request, async () => {
    const body = record(data);
    const email = body && text(body, "email");
    const name = body && text(body, "name");
    const code = body && text(body, "code");
    const roles = body && textList(body, "roles");
    const password = body && text(body, "password");
    if (
      email === null ||
      name === null ||
      code === null ||
      roles === null ||
      password === null ||
      !body
    ) {
      return reject(400, BAD_REQUEST);
    }
    return fromResult(await deps.users.create({ email, name, code, roles, password }));
  });
}

export function updateAccount(deps: AdminDeps, request: RequestLike, data: unknown) {
  return asAdmin<User>(deps, request, async () => {
    const body = record(data);
    const id = body && text(body, "id");
    const name = body && text(body, "name");
    const code = body && text(body, "code");
    const roles = body && textList(body, "roles");
    if (!body || id === null || name === null || code === null || roles === null) {
      return reject(400, BAD_REQUEST);
    }
    return fromResult(await deps.users.update(id, { name, code, roles }));
  });
}

export function setAccountActive(deps: AdminDeps, request: RequestLike, data: unknown) {
  return asAdmin<User>(deps, request, async () => {
    const body = record(data);
    const id = body && text(body, "id");
    if (!body || id === null || typeof body.active !== "boolean") {
      return reject(400, BAD_REQUEST);
    }
    return fromResult(await deps.users.setActive(id, body.active));
  });
}

export function resetAccountPassword(deps: AdminDeps, request: RequestLike, data: unknown) {
  return asAdmin<null>(deps, request, async () => {
    const body = record(data);
    const id = body && text(body, "id");
    const password = body && text(body, "password");
    if (!body || id === null || password === null) return reject(400, BAD_REQUEST);
    return fromResult(await deps.users.resetPassword(id, password));
  });
}

export function listAdminSpaces(deps: AdminDeps, request: RequestLike) {
  return asAdmin<Space[]>(deps, request, async () => ({
    ok: true,
    data: await deps.spaces.list(),
  }));
}

export function createSpace(deps: AdminDeps, request: RequestLike, data: unknown) {
  return asAdmin<Space>(deps, request, async () => {
    const body = record(data);
    const name = body && text(body, "name");
    const cap = body && capacity(body);
    if (!body || name === null || cap === undefined) return reject(400, BAD_REQUEST);
    return fromResult(await deps.spaces.create({ name, capacity: cap }));
  });
}

export function updateSpace(deps: AdminDeps, request: RequestLike, data: unknown) {
  return asAdmin<Space>(deps, request, async () => {
    const body = record(data);
    const id = body && text(body, "id");
    const name = body && text(body, "name");
    const cap = body && capacity(body);
    if (!body || id === null || name === null || cap === undefined) {
      return reject(400, BAD_REQUEST);
    }
    return fromResult(await deps.spaces.update(id, { name, capacity: cap }));
  });
}
