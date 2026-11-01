import { createServerFn } from "@tanstack/react-start";
import { previewAscXml } from "#/import-asc/index.ts";
import { MAX_XML_BYTES } from "#/import-asc/read.ts";
import { type PreviewView, toPreviewView } from "./import-preview-view.ts";

export type PreviewImportResult =
  | { ok: true; preview: PreviewView }
  | { ok: false; message: string };

const GENERIC_MESSAGE =
  "Não foi possível processar o arquivo. Verifique se ele é um XML exportado do aSc Horários.";

function fail(message: string): PreviewImportResult {
  return { ok: false, message };
}

/**
 * Lê o campo `file` do formulário e devolve a prévia. Não persiste nada e nunca registra o
 * conteúdo; em erro inesperado registra apenas o nome do erro.
 */
export async function runPreviewImport(formData: FormData): Promise<PreviewImportResult> {
  try {
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return fail("Selecione um arquivo XML para importar.");
    }
    if (file.size > MAX_XML_BYTES) return fail("O arquivo é maior que o limite de 10 MB.");
    const result = previewAscXml(new Uint8Array(await file.arrayBuffer()));
    if (!result.ok) return fail(result.error.message);
    return { ok: true, preview: toPreviewView(result.preview) };
  } catch (error) {
    console.error("[importar] falha inesperada:", error instanceof Error ? error.name : "erro");
    return fail(GENERIC_MESSAGE);
  }
}

/** Valida a entrada do server fn: precisa ser um `FormData`. */
export function parseUploadInput(data: unknown): FormData {
  if (!(data instanceof FormData)) throw new Error("Envio inválido.");
  return data;
}

/** Corpo do server fn, separado para ser testável fora do runtime do Start. */
export function previewHandler({ data }: { data: FormData }): Promise<PreviewImportResult> {
  return runPreviewImport(data);
}

/** Gera a prévia de um XML enviado pela tela (apenas em memória; nada é gravado). */
export const previewImport = createServerFn({ method: "POST" })
  .validator(parseUploadInput)
  .handler(previewHandler);
