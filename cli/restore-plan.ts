import { existsSync, statSync } from "node:fs";
import { normalize, resolve } from "node:path";

export type RestorePlanInput = {
  fromPath?: string | undefined;
  targetPath?: string | undefined;
  now?: Date | undefined;
  /** Injeção de dependência opcional para testes */
  fs?: {
    existsSync?: (path: string) => boolean;
    isFile?: (path: string) => boolean;
  };
};

export type RestorePlan =
  | {
      ok: true;
      sourceFromPath: string;
      targetDbPath: string;
      safetyBackupPath: string;
      walPath: string;
      shmPath: string;
    }
  | {
      ok: false;
      errors: string[];
    };

// Caracteres de controle proibidos
// biome-ignore lint/suspicious/noControlCharactersInRegex: detecta caracteres de controle em caminhos
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/**
 * Função pura de planejamento da restauração:
 * Valida o caminho do arquivo de backup de origem, o banco de destino e calcula
 * os caminhos da cópia de segurança pré-restauração e dos arquivos WAL/SHM.
 */
export function planRestore(input: RestorePlanInput): RestorePlan {
  const errors: string[] = [];

  const fromRaw = input.fromPath?.trim();
  if (!fromRaw) {
    errors.push("Caminho do arquivo de restauração (--from) é obrigatório.");
  } else if (CONTROL_CHARS.test(fromRaw)) {
    errors.push("Caminho de restauração contém caracteres de controle inválidos.");
  }

  const targetRaw = input.targetPath?.trim();
  if (!targetRaw) {
    errors.push("Caminho do banco de dados de destino (DATABASE_PATH) não configurado.");
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const sourceFromPath = resolve(fromRaw as string);
  const targetDbPath = resolve(targetRaw as string);

  if (normalize(sourceFromPath).toLowerCase() === normalize(targetDbPath).toLowerCase()) {
    errors.push("O arquivo de origem (--from) não pode ser o mesmo do banco de dados de destino.");
    return { ok: false, errors };
  }

  const existsChecker = input.fs?.existsSync ?? existsSync;
  if (!existsChecker(sourceFromPath)) {
    errors.push(`Arquivo de backup não encontrado: "${sourceFromPath}".`);
    return { ok: false, errors };
  }

  const isFileChecker =
    input.fs?.isFile ??
    ((filePath: string) => {
      try {
        return statSync(filePath).isFile();
      } catch {
        return false;
      }
    });

  if (!isFileChecker(sourceFromPath)) {
    errors.push(`O caminho fornecido em --from não é um arquivo: "${sourceFromPath}".`);
    return { ok: false, errors };
  }

  const now = input.now ?? new Date();
  // Formato de timestamp seguro para nomes de arquivos em qualquer SO (sem dois-pontos)
  const timestamp = now.toISOString().replace(/[:.]/g, "-");
  const safetyBackupPath = `${targetDbPath}.bak-${timestamp}`;
  const walPath = `${targetDbPath}-wal`;
  const shmPath = `${targetDbPath}-shm`;

  return {
    ok: true,
    sourceFromPath,
    targetDbPath,
    safetyBackupPath,
    walPath,
    shmPath,
  };
}
