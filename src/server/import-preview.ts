import { previewAscXml } from "#/import-asc/index.ts";
import { MAX_XML_BYTES } from "#/import-asc/read.ts";
import { type PreviewView, toPreviewView } from "./import-preview-view.ts";
import { checkContentLength, readBodyWithLimit, TOO_LARGE_MESSAGE } from "./upload-limit.ts";

export type PreviewImportResult =
  | { ok: true; preview: PreviewView }
  | { ok: false; message: string };

const GENERIC_MESSAGE =
  "Não foi possível processar o arquivo. Verifique se ele é um XML exportado do aSc Horários.";
const EMPTY_MESSAGE = "Selecione um arquivo XML para importar.";

function reply(result: PreviewImportResult, status = 200): Response {
  return Response.json(result, { status });
}

/**
 * Trata o POST da prévia: o corpo da requisição é o próprio XML (sem multipart). O tamanho é
 * verificado pelo `Content-Length` e novamente durante a leitura em pedaços, que é cancelada ao
 * passar de 10 MB. Nada é gravado nem registrado; em erro inesperado só o nome do erro vai ao log.
 */
export async function handlePreviewRequest(request: Request): Promise<Response> {
  try {
    const length = checkContentLength(request.headers, MAX_XML_BYTES);
    if (!length.ok) return reply({ ok: false, message: length.message }, length.status);
    const bytes = await readBodyWithLimit(request.body, MAX_XML_BYTES);
    if (bytes === null) return reply({ ok: false, message: TOO_LARGE_MESSAGE }, 413);
    if (bytes.byteLength === 0) return reply({ ok: false, message: EMPTY_MESSAGE }, 400);
    const result = previewAscXml(bytes);
    if (!result.ok) return reply({ ok: false, message: result.error.message }, 422);
    return reply({ ok: true, preview: toPreviewView(result.preview) });
  } catch (error) {
    console.error("[importar] falha inesperada:", error instanceof Error ? error.name : "erro");
    return reply({ ok: false, message: GENERIC_MESSAGE }, 500);
  }
}
