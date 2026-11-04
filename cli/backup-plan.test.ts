import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { defaultIsCreatableDir, escapeSqlPath, planBackup } from "./backup-plan.ts";

describe("cli/backup-plan", () => {
  test("escapeSqlPath escapa aspas simples e normaliza barras", () => {
    expect(escapeSqlPath("C:\\data\\test.sqlite")).toBe("'C:/data/test.sqlite'");
    expect(escapeSqlPath("C:\\data\\test's_db.sqlite")).toBe("'C:/data/test''s_db.sqlite'");
    expect(escapeSqlPath("/var/backups/backup.sqlite")).toBe("'/var/backups/backup.sqlite'");
  });

  test("rejeita quando outPath está ausente ou vazio", () => {
    const r1 = planBackup({ outPath: undefined, dbPath: "./data/app.sqlite" });
    expect(r1.ok).toBe(false);
    if (!r1.ok) {
      expect(r1.errors).toContain("Caminho do arquivo de saída (--out) é obrigatório.");
    }

    const r2 = planBackup({ outPath: "   ", dbPath: "./data/app.sqlite" });
    expect(r2.ok).toBe(false);
    if (!r2.ok) {
      expect(r2.errors).toContain("Caminho do arquivo de saída (--out) é obrigatório.");
    }
  });

  test("rejeita caracteres de controle no caminho de saída", () => {
    const r = planBackup({ outPath: "backup\x00.sqlite", dbPath: "./data/app.sqlite" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors).toContain("Caminho de saída contém caracteres de controle inválidos.");
    }
  });

  test("rejeita caracteres inválidos em nomes de arquivos", () => {
    const r = planBackup({ outPath: "backup*?.sqlite", dbPath: "./data/app.sqlite" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors).toContain("Caminho de saída contém caracteres inválidos.");
    }
  });

  test("rejeita quando dbPath está ausente ou vazio", () => {
    const r = planBackup({ outPath: "./backup.sqlite", dbPath: undefined });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors).toContain(
        "Caminho do banco de dados ativo (DATABASE_PATH) não configurado.",
      );
    }
  });

  test("rejeita quando o caminho de saída é idêntico ao banco de dados ativo", () => {
    const dbPath = "./data/app.sqlite";
    const r1 = planBackup({ outPath: dbPath, dbPath });
    expect(r1.ok).toBe(false);
    if (!r1.ok) {
      expect(r1.errors).toContain(
        "O caminho de destino do backup não pode ser igual ao banco de dados ativo.",
      );
    }

    // Mesmo caminho absoluto com caixas diferentes ou barras diferentes
    const r2 = planBackup({
      outPath: resolve(dbPath).toUpperCase(),
      dbPath: resolve(dbPath).toLowerCase(),
    });
    expect(r2.ok).toBe(false);
    if (!r2.ok) {
      expect(r2.errors).toContain(
        "O caminho de destino do backup não pode ser igual ao banco de dados ativo.",
      );
    }
  });

  test("rejeita quando o diretório de destino não pode ser criado", () => {
    const r = planBackup({
      outPath: "/invalid/directory/backup.sqlite",
      dbPath: "./data/app.sqlite",
      isCreatableDir: () => false,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.includes("não existe e não pode ser criado"))).toBe(true);
    }
  });

  test("gera plano válido com caminhos resolvidos e instrução VACUUM INTO", () => {
    const outPath = "./backups/test-backup.sqlite";
    const dbPath = "./data/app.sqlite";

    const plan = planBackup({
      outPath,
      dbPath,
      isCreatableDir: () => true,
    });

    expect(plan.ok).toBe(true);
    if (plan.ok) {
      expect(plan.destinationPath).toBe(resolve(outPath));
      expect(plan.sourceDbPath).toBe(resolve(dbPath));
      const expectedEscaped = escapeSqlPath(resolve(outPath));
      expect(plan.vacuumSql).toBe(`VACUUM INTO ${expectedEscaped};`);
    }
  });

  test("defaultIsCreatableDir reconhece diretórios existentes", () => {
    expect(defaultIsCreatableDir(process.cwd())).toBe(true);
  });
});
