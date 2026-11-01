#!/usr/bin/env bun
import { runInit } from "./init.ts";

const HELP = `reserva-espacos: CLI de instalação

Comandos:
  init    Configura o alvo local ou Cloudflare (use \`init --help\`)

Opções:
  --help  Mostra esta ajuda
`;

const [command, ...rest] = process.argv.slice(2);

if (command === "init") {
  process.exit(await runInit(rest));
}
if (command === "--help" || command === "-h") {
  console.log(HELP);
  process.exit(0);
}
console.error(HELP);
process.exit(1);
