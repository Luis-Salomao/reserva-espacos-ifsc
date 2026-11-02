import { MAX_XML_BYTES } from "#/import-asc/read.ts";
import { type AdminResponse, reject } from "./admin-actions.ts";
import { requireRole } from "./auth-handlers.ts";
import { type ImportDeps, prepareImport } from "./import-actions.ts";
import { IMPORT_ROLES } from "./session.ts";
import { checkContentLength, readBodyWithLimit, TOO_LARGE_MESSAGE } from "./upload-limit.ts";

const INVALID = "Requisição inválida.";
const GENERIC = "Não foi possível preparar a importação. Tente novamente em instantes.";

function reply(response: AdminResponse<unknown>, setCookie: string | null = null): Response {
  const headers = new Headers({ "Cache-Control": "no-store" });
  if (setCookie !== null) headers.set("Set-Cookie", setCookie);
  const status =
    !response.ok && (response.status === 401 || response.status === 403) ? response.status : 200;
  return Response.json(response, { status, headers });
}

/**
 * POST do preparo do lote: o corpo é o próprio XML (reenviado a cada passo, porque o servidor não
 * o guarda) e a query traz `semesterId` e, opcionalmente, `maxCalls` (orçamento do passo).
 * Respeita o limite de 10 MB como a prévia e responde com o resultado tipado das ações.
 */
export async function handlePrepareRequest(
  request: Pick<Request, "url" | "headers" | "body">,
  deps: ImportDeps,
): Promise<Response> {
  try {
    // Sessão e papel antes de ler qualquer byte do corpo (até 10 MB).
    const access = await requireRole(request, deps.auth, IMPORT_ROLES, deps.cookieSecure);
    if (!access.ok) {
      const body = (await access.response.json()) as { message: string };
      return reply(reject(access.response.status === 401 ? 401 : 403, body.message));
    }
    const params = new URL(request.url).searchParams;
    const semesterId = params.get("semesterId") ?? "";
    const rawCalls = params.get("maxCalls");
    const maxCalls = rawCalls === null ? undefined : Number(rawCalls);
    if (semesterId === "" || (maxCalls !== undefined && !Number.isInteger(maxCalls))) {
      return reply(reject(400, INVALID));
    }
    const length = checkContentLength(request.headers, MAX_XML_BYTES);
    if (!length.ok) return reply(reject(400, length.message));
    const bytes = await readBodyWithLimit(request.body, MAX_XML_BYTES);
    if (bytes === null) return reply(reject(400, TOO_LARGE_MESSAGE));
    const outcome = await prepareImport(deps, request, semesterId, bytes, maxCalls);
    return reply(outcome.response, outcome.setCookie);
  } catch (error) {
    console.error("[importar] falha no preparo:", error instanceof Error ? error.name : "erro");
    return reply(reject(400, GENERIC));
  }
}
