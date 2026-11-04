import { MAX_XML_BYTES } from "#/import-asc/read.ts";
import { type AdminOutcome, type AdminResponse, reject } from "./admin-actions.ts";
import { requireRole } from "./auth-handlers.ts";
import { type ImportDeps, prepareImport, refreshResponsibles } from "./import-actions.ts";
import { IMPORT_ROLES } from "./session.ts";
import { checkContentLength, readBodyWithLimit, TOO_LARGE_MESSAGE } from "./upload-limit.ts";

const INVALID = "Requisição inválida.";
const GENERIC = "Não foi possível preparar a importação. Tente novamente em instantes.";
const GENERIC_RESPONSIBLES =
  "Não foi possível atualizar os responsáveis. Tente novamente em instantes.";

type XmlRequest = Pick<Request, "url" | "headers" | "body">;

function reply(response: AdminResponse<unknown>, setCookie: string | null = null): Response {
  const headers = new Headers({ "Cache-Control": "no-store" });
  if (setCookie !== null) headers.set("Set-Cookie", setCookie);
  const status =
    !response.ok && (response.status === 401 || response.status === 403) ? response.status : 200;
  return Response.json(response, { status, headers });
}

/**
 * POST com o XML no corpo e o `semesterId` na query. Sessão e papel são conferidos antes de ler
 * qualquer byte do corpo (até 10 MB); `run` devolve `null` quando a query é inválida.
 */
async function handleXmlPost(
  request: XmlRequest,
  deps: ImportDeps,
  failure: { log: string; message: string },
  run: (
    semesterId: string,
    params: URLSearchParams,
  ) => ((bytes: Uint8Array) => Promise<AdminOutcome<unknown>>) | null,
): Promise<Response> {
  try {
    const access = await requireRole(request, deps.auth, IMPORT_ROLES, deps.cookieSecure);
    if (!access.ok) {
      const body = (await access.response.json()) as { message: string };
      return reply(reject(access.response.status === 401 ? 401 : 403, body.message));
    }
    const params = new URL(request.url).searchParams;
    const semesterId = params.get("semesterId") ?? "";
    const action = semesterId === "" ? null : run(semesterId, params);
    if (action === null) return reply(reject(400, INVALID));
    const length = checkContentLength(request.headers, MAX_XML_BYTES);
    if (!length.ok) return reply(reject(400, length.message));
    const bytes = await readBodyWithLimit(request.body, MAX_XML_BYTES);
    if (bytes === null) return reply(reject(400, TOO_LARGE_MESSAGE));
    const outcome = await action(bytes);
    return reply(outcome.response, outcome.setCookie);
  } catch (error) {
    console.error(failure.log, error instanceof Error ? error.name : "erro");
    return reply(reject(400, failure.message));
  }
}

/**
 * POST do preparo do lote: o corpo é o próprio XML (reenviado a cada passo, porque o servidor não
 * o guarda) e a query traz `semesterId` e, opcionalmente, `maxCalls` (orçamento do passo).
 * Respeita o limite de 10 MB como a prévia e responde com o resultado tipado das ações.
 */
export function handlePrepareRequest(request: XmlRequest, deps: ImportDeps): Promise<Response> {
  return handleXmlPost(
    request,
    deps,
    { log: "[importar] falha no preparo:", message: GENERIC },
    (semesterId, params) => {
      const rawCalls = params.get("maxCalls");
      const maxCalls = rawCalls === null ? undefined : Number(rawCalls);
      if (maxCalls !== undefined && !Number.isInteger(maxCalls)) return null;
      return (bytes) => prepareImport(deps, request, semesterId, bytes, maxCalls);
    },
  );
}

/** POST de "Atualizar responsáveis": o corpo é o XML da versão aplicada do semestre da query. */
export function handleResponsiblesRequest(
  request: XmlRequest,
  deps: ImportDeps,
): Promise<Response> {
  return handleXmlPost(
    request,
    deps,
    { log: "[importar] falha ao atualizar responsáveis:", message: GENERIC_RESPONSIBLES },
    (semesterId) => (bytes) => refreshResponsibles(deps, request, semesterId, bytes),
  );
}
