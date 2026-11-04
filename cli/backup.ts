import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, statSync, unlinkSync } from "node:fs";
import { parseArgs } from "node:util";
import { getEnv } from "#/infra/env.ts";
import { planBackup } from "./backup-plan.ts";

const USAGE = `Uso: bun run cli backup --out <arquivo> [--overwrite]

Gera uma cópia íntegra do banco de dados SQLite local utilizando VACUUM INTO.
A operação é consistente mesmo com o servidor ativo em modo WAL.

Opções:
  --out <arquivo>    Caminho do arquivo de destino do backup (obrigatório)
  --db-path <banco>  Caminho alternativo do banco de dados (padrão: DATABASE_PATH)
  --overwrite, -f    Sobrescreve o arquivo de destino se ele já existir
  --help, -h         Mostra esta mensagem de ajuda
`;

export type RunBackupOptions = {
  out?: string;
  dbPath?: string;
  overwrite?: boolean;
};

/** Executa o comando de backup via linha de comando */
export async function runBackup(argv: string[]): Promise<number> {
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({
      args: argv,
      options: {
        out: { type: "string" },
        "db-path": { type: "string" },
        overwrite: { type: "boolean", short: "f", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
      strict: true,
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(USAGE);
    return 1;
  }

  if (parsed.values.help) {
    console.log(USAGE);
    return 0;
  }

  let dbPath = (parsed.values["db-path"] as string | undefined) ?? process.env.DATABASE_PATH;
  if (!dbPath) {
    try {
      const env = getEnv({ ...process.env, DEPLOY_TARGET: process.env.DEPLOY_TARGET || "local" });
      dbPath = env.DATABASE_PATH;
    } catch {
      // Deixa o planBackup reportar erro claro
    }
  }

  const outPath = parsed.values.out as string | undefined;
  const overwrite = Boolean(parsed.values.overwrite);

  return executeBackup({ outPath, dbPath, overwrite });
}

/** Executa a operação de backup programaticamente */
export function executeBackup(options: {
  outPath?: string;
  dbPath?: string;
  overwrite?: boolean;
}): number {
  const plan = planBackup({
    outPath: options.outPath,
    dbPath: options.dbPath,
  });

  if (!plan.ok) {
    for (const err of plan.errors) {
      console.error(`Erro: ${err}`);
    }
    return 1;
  }

  if (existsSync(plan.destinationPath)) {
    if (!options.overwrite) {
      console.error(
        `Erro: O arquivo de destino "${plan.destinationPath}" já existe. Use --overwrite para sobrescrever.`,
      );
      return 1;
    }
    try {
      unlinkSync(plan.destinationPath);
    } catch (err) {
      console.error(
        `Erro: Não foi possível remover o arquivo existente "${plan.destinationPath}": ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return 1;
    }
  }

  try {
    mkdirSync(plan.destinationDir, { recursive: true });
  } catch (err) {
    console.error(
      `Erro ao criar diretório "${plan.destinationDir}": ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return 1;
  }

  let db: Database | undefined;
  try {
    db = new Database(plan.sourceDbPath, { readonly: true });
    db.run(plan.vacuumSql);
  } catch (err) {
    console.error(`Erro ao executar backup: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  } finally {
    db?.close(true);
  }

  if (!existsSync(plan.destinationPath)) {
    console.error(`Erro: Arquivo de backup não foi criado em "${plan.destinationPath}".`);
    return 1;
  }

  const size = statSync(plan.destinationPath).size;
  console.log(`Backup concluído com sucesso: ${plan.destinationPath} (${size} bytes)`);
  return 0;
}
