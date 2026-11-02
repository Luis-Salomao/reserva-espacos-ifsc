#!/usr/bin/env bun
// Ponto de entrada enxuto empacotado na imagem Docker (`bun build` gera /app/cli.mjs): só o que a
// criação do primeiro administrador precisa (banco local, hasher, repositórios e migrações).
import { runCreateAdmin } from "./create-admin.ts";

const HELP = "Uso: bun /app/cli.mjs create-admin --email EMAIL --name NOME [--password-stdin]\n";

const [command, ...rest] = process.argv.slice(2);

if (command === "create-admin") process.exit(await runCreateAdmin(rest));
if (command === "--help" || command === "-h") {
  console.log(HELP);
  process.exit(0);
}
console.error(HELP);
process.exit(1);
