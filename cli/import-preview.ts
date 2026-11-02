import { existsSync, readFileSync } from "node:fs";
import { previewAscXml } from "#/import-asc/index.ts";
import { formatPreviewText, previewForJson } from "./import-preview-format.ts";

const USAGE = "Uso: bun run cli import-preview <arquivo.xml> [--json] [--full]";

/** Lê o XML, imprime a prévia e devolve o código de saída. Não grava nada. */
export function runImportPreview(args: string[]): number {
  const flags = new Set(args.filter((arg) => arg.startsWith("--")));
  const [path] = args.filter((arg) => !arg.startsWith("--"));
  if (flags.has("--help")) {
    console.log(USAGE);
    return 0;
  }
  if (flags.has("--full") && !flags.has("--json")) {
    console.error(`--full só vale junto com --json.\n${USAGE}`);
    return 1;
  }
  if (path === undefined) {
    console.error(USAGE);
    return 1;
  }
  if (!existsSync(path)) {
    console.error(`Arquivo não encontrado: ${path}`);
    return 1;
  }
  const result = previewAscXml(new Uint8Array(readFileSync(path)));
  if (!result.ok) {
    console.error(`Arquivo rejeitado: ${result.error.message}`);
    return 1;
  }
  if (flags.has("--json")) {
    console.log(JSON.stringify(previewForJson(result.preview, flags.has("--full")), null, 2));
  } else {
    console.log(formatPreviewText(result.preview));
  }
  return 0;
}
