#!/usr/bin/env bun
// Ponto de entrada enxuto empacotado na imagem Docker (`bun build` gera /app/cli.mjs):
// administração, cópia e restauração do banco de dados local.
import { runBackup } from "./backup.ts";
import { runCreateAdmin } from "./create-admin.ts";
import { runRestore } from "./restore.ts";

const HELP = `Uso: bun /app/cli.mjs <comando> [opções]

Comandos:
  email:check
  email:drain
  create-admin --email EMAIL --name NOME [--password-stdin]
  backup --out <arquivo> [--overwrite]
  restore --from <arquivo> [--target <banco>] [--yes]
`;

const [command, ...rest] = process.argv.slice(2);

if (command === "email:check") {
  const { runEmailCheck } = await import("./email-check.ts");
  process.exit(runEmailCheck(rest));
}

if (command === "email:drain") {
  const { runEmailDrain } = await import("./email-drain.ts");
  process.exit(await runEmailDrain(rest));
}

if (command === "create-admin") process.exit(await runCreateAdmin(rest));
if (command === "backup") process.exit(await runBackup(rest));
if (command === "restore") process.exit(await runRestore(rest));
if (command === "--help" || command === "-h") {
  console.log(HELP);
  process.exit(0);
}
console.error(HELP);
process.exit(1);
