import { existsSync, statSync } from "node:fs";
import { dirname, normalize, resolve } from "node:path";

export type BackupPlanInput = {
  outPath?: string | undefined;
  dbPath?: string | undefined;
  /** Função para testar se o diretório de destino existe ou pode ser criado */
  isCreatableDir?: (dir: string) => boolean;
};

export type BackupPlan =
  | {
      ok: true;
      sourceDbPath: string;
      destinationPath: string;
      destinationDir: string;
      vacuumSql: string;
    }
  | {
      ok: false;
      errors: string[];
    };

// Caracteres de controle proibidos em caminhos
// biome-ignore lint/suspicious/noControlCharactersInRegex: detecta caracteres de controle em caminhos
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

// Caracteres inválidos em nomes de arquivos (Windows e POSIX)
const INVALID_PATH_CHARS = /[*?"<>|]/;

/**
 * Verifica se um diretório existe ou se seus diretórios ancestrais existem e são pastas válidas,
 * permitindo que a árvore seja criada com `mkdir(..., { recursive: true })`.
 */
export function defaultIsCreatableDir(dirPath: string): boolean {
  try {
    let current = resolve(dirPath);
    while (true) {
      if (existsSync(current)) {
        try {
          const stat = statSync(current);
          return stat.isDirectory();
        } catch {
          return false;
        }
      }
      const parent = dirname(current);
      if (parent === current) {
        return false;
      }
      current = parent;
    }
  } catch {
    return false;
  }
}

/** Escapa caminho para literal SQL do SQLite entre aspas simples */
export function escapeSqlPath(filePath: string): string {
  // Converte barras invertidas em barras normais para compatibilidade cruzada no SQLite
  const normalized = filePath.replaceAll("\\", "/");
  return `'${normalized.replaceAll("'", "''")}'`;
}

/**
 * Função pura de planejamento do backup:
 * Valida o caminho de saída, o banco de dados ativo e monta a instrução VACUUM INTO.
 */
export function planBackup(input: BackupPlanInput): BackupPlan {
  const errors: string[] = [];

  const outRaw = input.outPath?.trim();
  if (!outRaw) {
    errors.push("Caminho do arquivo de saída (--out) é obrigatório.");
  } else {
    if (CONTROL_CHARS.test(outRaw)) {
      errors.push("Caminho de saída contém caracteres de controle inválidos.");
    }
    // Remove o prefixo de letra de unidade do Windows (ex: C:) antes de validar caracteres proibidos
    const pathWithoutDrive = outRaw.replace(/^[a-zA-Z]:[/\\]?/, "");
    if (INVALID_PATH_CHARS.test(pathWithoutDrive)) {
      errors.push("Caminho de saída contém caracteres inválidos.");
    }
  }

  const dbRaw = input.dbPath?.trim();
  if (!dbRaw) {
    errors.push("Caminho do banco de dados ativo (DATABASE_PATH) não configurado.");
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const destinationPath = resolve(outRaw as string);
  const sourceDbPath = resolve(dbRaw as string);

  // Compara caminhos normalizados de forma case-insensitive (padrão Windows/macOS)
  if (normalize(destinationPath).toLowerCase() === normalize(sourceDbPath).toLowerCase()) {
    errors.push("O caminho de destino do backup não pode ser igual ao banco de dados ativo.");
    return { ok: false, errors };
  }

  const destinationDir = dirname(destinationPath);
  const checker = input.isCreatableDir ?? defaultIsCreatableDir;

  if (!checker(destinationDir)) {
    errors.push(`Diretório de destino "${destinationDir}" não existe e não pode ser criado.`);
    return { ok: false, errors };
  }

  const vacuumSql = `VACUUM INTO ${escapeSqlPath(destinationPath)};`;

  return {
    ok: true,
    sourceDbPath,
    destinationPath,
    destinationDir,
    vacuumSql,
  };
}
