import { existsSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import { type InitAnswers, planInit, validateAnswers } from "./init-plan.ts";

const USAGE = `Uso: bun run cli init [opções]

Opções:
  --target local|cloudflare   Alvo de instalação
  --database-path CAMINHO     Arquivo SQLite (alvo local)
  --timezone FUSO             Fuso horário (padrão America/Sao_Paulo)
  --email-provider disabled|resend  Envio opcional (padrão disabled)
  --email-from REMETENTE      Remetente verificado no Resend (sem segredo)
  --public-origin ORIGEM      Origem pública HTTPS para links e CSRF
  --yes                       Confirma sem perguntar (no alvo cloudflare, para após o d1 create)
  --force                     Sobrescreve arquivos existentes
  --dry-run                   Mostra o plano e sai sem escrever nem executar
  --help                      Mostra esta ajuda
`;

function parse(argv: string[]) {
  return parseArgs({
    args: argv,
    options: {
      target: { type: "string" },
      "database-path": { type: "string" },
      timezone: { type: "string" },
      "email-provider": { type: "string" },
      "email-from": { type: "string" },
      "public-origin": { type: "string" },
      yes: { type: "boolean", default: false },
      force: { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
  });
}

class StdinClosedError extends Error {}

export async function runInit(argv: string[]): Promise<number> {
  let values: ReturnType<typeof parse>["values"];
  try {
    values = parse(argv).values;
  } catch (error) {
    console.error(`${error instanceof Error ? error.message : String(error)}\n`);
    console.error(USAGE);
    return 1;
  }
  if (values.help) {
    console.log(USAGE);
    return 0;
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const closed = new Promise<never>((_, reject) => {
    rl.once("close", () => reject(new StdinClosedError("stdin fechado; use --yes")));
  });
  closed.catch(() => {});
  const question = (text: string): Promise<string> => Promise.race([rl.question(text), closed]);

  try {
    const ask = async (text: string, fallback: string): Promise<string> => {
      if (values.yes) return fallback;
      const answer = (await question(`${text} [${fallback}]: `)).trim();
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
    const emailProvider =
      values["email-provider"] ?? (await ask("E-mail (disabled/resend)", "disabled"));
    if (emailProvider !== "disabled" && emailProvider !== "resend") {
      console.error("Provedor de e-mail inválido. Use disabled ou resend.");
      return 1;
    }
    answers.emailProvider = emailProvider;
    if (emailProvider === "resend") {
      answers.emailFrom = values["email-from"] ?? (await ask("Remetente verificado", ""));
      answers.publicOrigin = values["public-origin"] ?? (await ask("Origem pública HTTPS", ""));
    }

    const errors = validateAnswers(answers);
    if (errors.length > 0) {
      for (const message of errors) console.error(message);
      return 1;
    }

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
      const confirmation = (await question("\nConfirma? [y/N]: ")).trim().toLowerCase();
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
      let code: number;
      try {
        code = await Bun.spawn(command, { stdio: ["inherit", "inherit", "inherit"] }).exited;
      } catch (error) {
        console.error(
          `\nNão foi possível executar ${command.join(" ")}: ${error instanceof Error ? error.message : String(error)}`,
        );
        code = -1;
      }
      if (code !== 0) {
        console.error(`\nComando falhou (código ${code}): ${command.join(" ")}. Interrompido.`);
        console.error(
          "Os arquivos já foram gravados; para repetir a instalação use --force (ou rode os comandos restantes manualmente).",
        );
        return 1;
      }
      if (target === "cloudflare" && index === 0) {
        if (values.yes) {
          console.log(
            `\nO banco D1 foi criado. Cole o database_id no wrangler.jsonc e rode manualmente:\n${plan.commands
              .slice(1)
              .map((c) => `  $ ${c.join(" ")}`)
              .join("\n")}`,
          );
          return 0;
        }
        try {
          await question(
            "\nCole o database_id no wrangler.jsonc e pressione Enter para continuar...",
          );
        } catch (error) {
          if (!(error instanceof StdinClosedError)) throw error;
          console.error(
            `\nO banco D1 já foi criado, mas stdin foi fechado antes de continuar.\nCole o database_id no wrangler.jsonc e rode manualmente:\n${plan.commands
              .slice(1)
              .map((c) => `  $ ${c.join(" ")}`)
              .join("\n")}`,
          );
          return 1;
        }
      }
    }
    console.log("\nInstalação concluída.");
    return 0;
  } catch (error) {
    if (error instanceof StdinClosedError) {
      console.error(`\n${error.message}`);
      return 1;
    }
    throw error;
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
