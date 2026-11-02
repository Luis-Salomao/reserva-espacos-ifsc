#!/usr/bin/env bun
import { runCreateAdmin } from "./create-admin.ts";
import { runImportPreview } from "./import-preview.ts";
import { runInit } from "./init.ts";

const HELP = `reserva-espacos: CLI de instalação

Comandos:
  init    Configura o alvo local ou Cloudflare (use \`init --help\`)
  create-admin --email EMAIL --name NOME [--code SIGLA] [--target local|cloudflare]
          Cria uma conta admin (senha sem eco ou --password-stdin)
  import-preview <arquivo.xml> [--json] [--full]
          Mostra a prévia de um XML do aSc Horários (não grava nada)

Opções:
  --help  Mostra esta ajuda
`;

const [command, ...rest] = process.argv.slice(2);

if (command === "init") {
  process.exit(await runInit(rest));
}
if (command === "create-admin") {
  process.exit(await runCreateAdmin(rest));
}
if (command === "import-preview") {
  process.exit(runImportPreview(rest));
}
if (command === "--help" || command === "-h") {
  console.log(HELP);
  process.exit(0);
}
console.error(HELP);
process.exit(1);
