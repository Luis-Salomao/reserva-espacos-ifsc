import { Database } from "bun:sqlite";
import { copyFileSync, existsSync, mkdirSync, readFileSync, unlinkSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import { getEnv } from "#/infra/env.ts";
import { planRestore } from "./restore-plan.ts";

const USAGE = `Uso: bun run cli restore --from <arquivo> [--target <banco>] [--yes]

Restaura o banco de dados SQLite local a partir de uma cópia de backup.
A operação DEVE ser executada com o servidor da aplicação PARADO.

Etapas de segurança executadas:
  1. Verificação prévia de integridade (PRAGMA integrity_check) no arquivo de backup
  2. Verificação de versões de migração
  3. Cópia de segurança automática do banco atual (<alvo>.bak-<timestamp>)
  4. Limpeza preventiva de arquivos WAL e SHM
  5. Substituição do arquivo do banco
  6. Verificação pós-restauração de integridade (PRAGMA integrity_check)

Opções:
  --from <arquivo>    Caminho do arquivo de backup a restaurar (obrigatório)
  --target <banco>    Caminho alternativo do banco de destino (padrão: DATABASE_PATH)
  --yes, -y, --force  Confirma a restauração sem solicitar confirmação interativa
  --help, -h          Mostra esta mensagem de ajuda
`;

export type RunRestoreOptions = {
  from?: string;
  target?: string;
  yes?: boolean;
};

/**
 * Lê a contagem de migrações locais no journal do Drizzle se existir.
 */
function getLocalMigrationCount(): number | undefined {
  try {
    const journalPath = resolve(import.meta.dirname, "../drizzle/meta/_journal.json");
    if (existsSync(journalPath)) {
      const data = JSON.parse(readFileSync(journalPath, "utf8")) as { entries?: unknown[] };
      return data.entries?.length;
    }
  } catch {
    // Ignora se não conseguir ler journal local
  }
  return undefined;
}

/** Remove arquivo com tentativas em caso de bloqueio transitório no SO */
function safeUnlink(filePath: string, maxAttempts = 5, delayMs = 50): void {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      if (existsSync(filePath)) {
        unlinkSync(filePath);
      }
      return;
    } catch (err) {
      if (attempt === maxAttempts) throw err;
      Bun.sleepSync(delayMs);
    }
  }
}

/** Executa o comando de restauração via linha de comando */
export async function runRestore(argv: string[]): Promise<number> {
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({
      args: argv,
      options: {
        from: { type: "string" },
        target: { type: "string" },
        yes: { type: "boolean", short: "y", default: false },
        force: { type: "boolean", default: false },
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

  let targetPath = (parsed.values.target as string | undefined) ?? process.env.DATABASE_PATH;
  if (!targetPath) {
    try {
      const env = getEnv({ ...process.env, DEPLOY_TARGET: process.env.DEPLOY_TARGET || "local" });
      targetPath = env.DATABASE_PATH;
    } catch {
      // Deixa o planRestore reportar erro claro
    }
  }

  const fromPath = parsed.values.from as string | undefined;
  const isConfirmed = Boolean(parsed.values.yes || parsed.values.force);

  if (!isConfirmed) {
    if (process.stdin.isTTY) {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      try {
        const answer = await rl.question(
          "Atenção: A restauração irá substituir o banco de dados atual. Deseja continuar? [s/N]: ",
        );
        const normalized = answer.trim().toLowerCase();
        if (
          normalized !== "s" &&
          normalized !== "sim" &&
          normalized !== "y" &&
          normalized !== "yes"
        ) {
          console.log("Restauração cancelada pelo usuário.");
          return 0;
        }
      } finally {
        rl.close();
      }
    } else {
      console.error(
        "Erro: Em ambiente não interativo, utilize a opção --yes para confirmar a substituição.",
      );
      return 1;
    }
  }

  return executeRestore({ fromPath, targetPath });
}

/** Executa a operação de restauração programaticamente */
export function executeRestore(options: { fromPath?: string; targetPath?: string }): number {
  const plan = planRestore({
    fromPath: options.fromPath,
    targetPath: options.targetPath,
  });

  if (!plan.ok) {
    for (const err of plan.errors) {
      console.error(`Erro: ${err}`);
    }
    return 1;
  }

  // 1. Verificação prévia de integridade no arquivo de backup (modo leitura)
  let backupDb: Database | undefined;
  try {
    backupDb = new Database(plan.sourceFromPath, { readonly: true });
    const rows = backupDb.query("PRAGMA integrity_check").all() as Array<{
      integrity_check?: string;
    }>;
    const ok = rows.length === 1 && rows[0]?.integrity_check === "ok";
    if (!ok) {
      console.error(
        "Erro: O arquivo de backup falhou na verificação de integridade prévia (PRAGMA integrity_check).",
      );
      for (const row of rows) {
        console.error(`  - ${row.integrity_check}`);
      }
      console.error("Restauração abortada. O banco de dados ativo não foi alterado.");
      return 1;
    }

    // 2. Comparação de versões de migração
    const migrationTableExists = backupDb
      .query("SELECT name FROM sqlite_master WHERE type='table' AND name='__drizzle_migrations'")
      .get();

    if (migrationTableExists) {
      const result = backupDb.query("SELECT count(*) as count FROM __drizzle_migrations").get() as {
        count: number;
      };
      const backupMigrations = result?.count ?? 0;
      const localMigrations = getLocalMigrationCount();
      if (localMigrations !== undefined) {
        if (backupMigrations > localMigrations) {
          console.warn(
            `Aviso: O arquivo de backup possui ${backupMigrations} migrações registradas, ` +
              `enquanto o código local possui ${localMigrations}. ` +
              "O backup pode ter sido gerado por uma versão mais recente da aplicação.",
          );
        } else {
          console.log(`Migrações no backup: ${backupMigrations}/${localMigrations} compatíveis.`);
        }
      }
    }
  } catch (err) {
    console.error(
      `Erro: O arquivo de backup não é um banco SQLite válido ou está inacessível: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    console.error("Restauração abortada. O banco de dados ativo não foi alterado.");
    return 1;
  } finally {
    backupDb?.close(true);
  }

  const targetDir = dirname(plan.targetDbPath);
  try {
    mkdirSync(targetDir, { recursive: true });
  } catch (err) {
    console.error(
      `Erro ao preparar pasta de destino "${targetDir}": ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return 1;
  }

  // 3. Cópia de segurança do banco ativo antes da restauração
  let safetyBackupCreated = false;
  if (existsSync(plan.targetDbPath)) {
    try {
      copyFileSync(plan.targetDbPath, plan.safetyBackupPath);
      safetyBackupCreated = true;
      console.log(`Cópia de segurança criada em: ${plan.safetyBackupPath}`);
    } catch (err) {
      console.error(
        `Erro ao criar cópia de segurança em "${plan.safetyBackupPath}": ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      console.error(
        "Certifique-se de que o servidor da aplicação está parado e que os arquivos não estão bloqueados.",
      );
      return 1;
    }
  }

  // 4. Limpeza preventiva de arquivos -wal e -shm para evitar reaplicação de logs antigos
  try {
    safeUnlink(plan.walPath);
    safeUnlink(plan.shmPath);
  } catch (err) {
    console.error(
      `Erro ao limpar arquivos WAL/SHM: ${err instanceof Error ? err.message : String(err)}`,
    );
    console.error(
      "O banco pode estar aberto por outro processo. Pare o servidor da aplicação antes de restaurar.",
    );
    return 1;
  }

  // 5. Substituição atômica/segura do arquivo do banco
  try {
    copyFileSync(plan.sourceFromPath, plan.targetDbPath);
  } catch (err) {
    console.error(
      `Erro ao substituir arquivo do banco de dados: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    console.error(
      "Certifique-se de que o servidor da aplicação está parado antes de executar a restauração.",
    );
    // Se a cópia de segurança foi criada, tenta restaurá-la
    if (safetyBackupCreated && existsSync(plan.safetyBackupPath)) {
      try {
        copyFileSync(plan.safetyBackupPath, plan.targetDbPath);
        console.log("Banco de dados ativo restaurado a partir da cópia de segurança.");
      } catch {
        console.error("Falha ao restabelecer a cópia de segurança.");
      }
    }
    return 1;
  }

  // 6. Verificação pós-restauração de integridade no banco restaurado
  let restoredDb: Database | undefined;
  try {
    restoredDb = new Database(plan.targetDbPath, { readonly: true });
    const postRows = restoredDb.query("PRAGMA integrity_check").all() as Array<{
      integrity_check?: string;
    }>;
    const postOk = postRows.length === 1 && postRows[0]?.integrity_check === "ok";
    if (!postOk) {
      console.error(
        "Erro: O banco restaurado falhou na verificação final de integridade (PRAGMA integrity_check).",
      );
      if (safetyBackupCreated && existsSync(plan.safetyBackupPath)) {
        copyFileSync(plan.safetyBackupPath, plan.targetDbPath);
        console.error("Banco de dados ativo revertido para a cópia de segurança.");
      }
      return 1;
    }
  } catch (err) {
    console.error(
      `Erro na verificação de integridade pós-restauração: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    if (safetyBackupCreated && existsSync(plan.safetyBackupPath)) {
      try {
        copyFileSync(plan.safetyBackupPath, plan.targetDbPath);
        console.error("Banco de dados ativo revertido para a cópia de segurança.");
      } catch {
        // Ignora
      }
    }
    return 1;
  } finally {
    restoredDb?.close(true);
  }

  console.log(`Restauração concluída com sucesso no banco: ${plan.targetDbPath}`);
  return 0;
}
