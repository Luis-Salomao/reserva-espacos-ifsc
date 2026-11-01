import { existsSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import { type InitAnswers, planInit } from "./init-plan.ts";

const USAGE = `Uso: bun run cli init [opções]

Opções:
  --target local|cloudflare   Alvo de instalação
  --database-path CAMINHO     Arquivo SQLite (alvo local)
  --timezone FUSO             Fuso horário (padrão America/Sao_Paulo)
  --yes                       Confirma sem perguntar (no alvo cloudflare, para após o d1 create)
  --force                     Sobrescreve arquivos existentes
  --dry-run                   Mostra o plano e sai sem escrever nem executar
`;

export async function runInit(argv: string[]): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      target: { type: "string" },
      "database-path": { type: "string" },
      timezone: { type: "string" },
      yes: { type: "boolean", default: false },
      force: { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
  });
  if (values.help) {
    console.log(USAGE);
    return 0;
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const ask = async (question: string, fallback: string): Promise<string> => {
      if (values.yes) return fallback;
      const answer = (await rl.question(`${question} [${fallback}]: `)).trim();
      return answer === "" ? fallback : answer;
    };

    const target = values.target ?? (await ask("Alvo (local/cloudflare)", "local"));
    if (target !== "local" && target !== "cloudflare") {
      console.error(`Alvo inválido: ${target}. Use local ou cloudflare.`);
      return 1;
    }
    const answers: InitAnswers = { target };
    if (target === "local") {
      answers.databasePath =
        values["database-path"] ?? (await ask("Caminho do banco SQLite", "./data/app.sqlite"));
    }
    answers.timezone = values.timezone ?? (await ask("Fuso horário", "America/Sao_Paulo"));

    const plan = planInit(answers);
    console.log("\nArquivos a criar:");
    for (const file of plan.files) console.log(`  ${file.path}\n${indent(file.content)}`);
    console.log("Comandos a executar:");
    for (const command of plan.commands) console.log(`  $ ${command.join(" ")}`);
    for (const note of plan.notes) console.log(`  ${note}`);

    if (values["dry-run"]) return 0;

    if (!values.force) {
      const existing = plan.files.filter((file) => existsSync(file.path));
      if (existing.length > 0) {
        console.error(
          `\nArquivo já existe: ${existing.map((f) => f.path).join(", ")}. Use --force para sobrescrever.`,
        );
        return 1;
      }
    }

    if (!values.yes) {
      const confirmation = (await rl.question("\nConfirma? [y/N]: ")).trim().toLowerCase();
      if (confirmation !== "y" && confirmation !== "yes") {
        console.log("Cancelado.");
        return 1;
      }
    }

    for (const file of plan.files) {
      await Bun.write(file.path, file.content);
      console.log(`Criado ${file.path}`);
    }

    for (const [index, command] of plan.commands.entries()) {
      console.log(`\n$ ${command.join(" ")}`);
      const proc = Bun.spawn(command, { stdio: ["inherit", "inherit", "inherit"] });
      const code = await proc.exited;
      if (code !== 0) {
        console.error(`\nComando falhou (código ${code}): ${command.join(" ")}. Interrompido.`);
        return 1;
      }
      if (target === "cloudflare" && index === 0) {
        if (values.yes) {
          console.log(
            `\nCole o database_id no wrangler.jsonc e rode manualmente:\n${plan.commands
              .slice(1)
              .map((c) => `  $ ${c.join(" ")}`)
              .join("\n")}`,
          );
          return 0;
        }
        await rl.question(
          "\nCole o database_id no wrangler.jsonc e pressione Enter para continuar...",
        );
      }
    }
    console.log("\nInstalação concluída.");
    return 0;
  } finally {
    rl.close();
  }
}

function indent(text: string): string {
  return text
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => `    ${line}`)
    .join("\n");
}
