#!/usr/bin/env bun
import { runBackup } from "./backup.ts";
import { runCreateAdmin } from "./create-admin.ts";
import { runImportPreview } from "./import-preview.ts";
import { runInit } from "./init.ts";
import { runRestore } from "./restore.ts";

const HELP = `reserva-espacos: CLI de instalação

Comandos:
  email:check  Verifica a configuração sem enviar mensagens nem exibir segredos
  email:drain  Processa um lote da outbox local (para cron/Agendador de Tarefas)
  init    Configura o alvo local ou Cloudflare (use \`init --help\`)
  create-admin --email EMAIL --name NOME [--code SIGLA] [--target local|cloudflare]
          Cria uma conta admin (senha sem eco ou --password-stdin)
  import-preview <arquivo.xml> [--json] [--full]
          Mostra a prévia de um XML do aSc Horários (não grava nada)
  backup --out <arquivo> [--overwrite]
          Cria uma cópia íntegra do banco SQLite via VACUUM INTO
  restore --from <arquivo> [--target <banco>] [--yes]
          Restaura o banco a partir de uma cópia com integridade verificada

Opções:
  --help  Mostra esta ajuda
`;

const [command, ...rest] = process.argv.slice(2);

if (command === "email:drain") {
  const { runEmailDrain } = await import("./email-drain.ts");
  process.exit(await runEmailDrain(rest));
}

if (command === "email:check") {
  const { runEmailCheck } = await import("./email-check.ts");
  process.exit(runEmailCheck(rest));
}
if (command === "init") {
  process.exit(await runInit(rest));
}
if (command === "create-admin") {
  process.exit(await runCreateAdmin(rest));
}
if (command === "import-preview") {
  process.exit(runImportPreview(rest));
}
if (command === "backup") {
  process.exit(await runBackup(rest));
}
if (command === "restore") {
  process.exit(await runRestore(rest));
}
if (command === "--help" || command === "-h") {
  console.log(HELP);
  process.exit(0);
}
console.error(HELP);
process.exit(1);
