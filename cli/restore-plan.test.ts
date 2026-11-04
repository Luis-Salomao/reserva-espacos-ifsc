import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { planRestore } from "./restore-plan.ts";

describe("cli/restore-plan", () => {
  const mockFs = {
    existsSync: (path: string) => path.includes("exists.sqlite"),
    isFile: (path: string) => !path.includes("directory"),
  };

  test("rejeita quando fromPath está ausente ou vazio", () => {
    const r1 = planRestore({ fromPath: undefined, targetPath: "./data/app.sqlite" });
    expect(r1.ok).toBe(false);
    if (!r1.ok) {
      expect(r1.errors).toContain("Caminho do arquivo de restauração (--from) é obrigatório.");
    }

    const r2 = planRestore({ fromPath: "   ", targetPath: "./data/app.sqlite" });
    expect(r2.ok).toBe(false);
    if (!r2.ok) {
      expect(r2.errors).toContain("Caminho do arquivo de restauração (--from) é obrigatório.");
    }
  });

  test("rejeita caracteres de controle no caminho de restauração", () => {
    const r = planRestore({
      fromPath: "backup\x00.sqlite",
      targetPath: "./data/app.sqlite",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors).toContain("Caminho de restauração contém caracteres de controle inválidos.");
    }
  });

  test("rejeita quando targetPath está ausente ou vazio", () => {
    const r = planRestore({
      fromPath: "./backup.sqlite",
      targetPath: undefined,
      fs: mockFs,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors).toContain(
        "Caminho do banco de dados de destino (DATABASE_PATH) não configurado.",
      );
    }
  });

  test("rejeita quando o arquivo de origem é idêntico ao banco de destino", () => {
    const targetPath = "./data/app.sqlite";
    const r1 = planRestore({
      fromPath: targetPath,
      targetPath,
      fs: mockFs,
    });
    expect(r1.ok).toBe(false);
    if (!r1.ok) {
      expect(r1.errors).toContain(
        "O arquivo de origem (--from) não pode ser o mesmo do banco de dados de destino.",
      );
    }

    const r2 = planRestore({
      fromPath: resolve(targetPath).toUpperCase(),
      targetPath: resolve(targetPath).toLowerCase(),
      fs: mockFs,
    });
    expect(r2.ok).toBe(false);
    if (!r2.ok) {
      expect(r2.errors).toContain(
        "O arquivo de origem (--from) não pode ser o mesmo do banco de dados de destino.",
      );
    }
  });

  test("rejeita quando o arquivo de origem não existe", () => {
    const r = planRestore({
      fromPath: "./not-found.sqlite",
      targetPath: "./data/app.sqlite",
      fs: mockFs,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.includes("Arquivo de backup não encontrado"))).toBe(true);
    }
  });

  test("rejeita quando o caminho de origem é um diretório e não um arquivo", () => {
    const r = planRestore({
      fromPath: "./directory-exists.sqlite",
      targetPath: "./data/app.sqlite",
      fs: mockFs,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.includes("não é um arquivo"))).toBe(true);
    }
  });

  test("gera plano válido com caminhos calculados de backup de segurança, WAL e SHM", () => {
    const fixedDate = new Date("2026-11-04T12:30:00.000Z");
    const targetPath = "./data/app.sqlite";
    const fromPath = "./backups/exists.sqlite";

    const plan = planRestore({
      fromPath,
      targetPath,
      now: fixedDate,
      fs: mockFs,
    });

    expect(plan.ok).toBe(true);
    if (plan.ok) {
      expect(plan.sourceFromPath).toBe(resolve(fromPath));
      expect(plan.targetDbPath).toBe(resolve(targetPath));
      expect(plan.safetyBackupPath).toBe(`${resolve(targetPath)}.bak-2026-11-04T12-30-00-000Z`);
      expect(plan.walPath).toBe(`${resolve(targetPath)}-wal`);
      expect(plan.shmPath).toBe(`${resolve(targetPath)}-shm`);
    }
  });
});
