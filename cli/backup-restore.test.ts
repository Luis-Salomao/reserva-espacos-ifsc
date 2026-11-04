import { Database } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import * as schema from "#/infra/db/schema.ts";
import { runBackup } from "./backup.ts";
import { runRestore } from "./restore.ts";

describe("Demonstração Sintética: Ciclo de Backup, Exclusão e Restauração (RO-01)", () => {
  let tempDir: string;
  let activeDbPath: string;
  let backupFilePath: string;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), "reserva-backup-restore-"));
    activeDbPath = join(tempDir, "active.sqlite");
    backupFilePath = join(tempDir, "backup.sqlite");
  });

  afterAll(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignora falha de limpeza temporária no SO
    }
  });

  test("Ciclo completo: criação, seed, backup (VACUUM INTO), exclusão, restauração e validação", async () => {
    // 1. Inicializa banco ativo e aplica migrações do Drizzle
    const activeDb = new Database(activeDbPath);
    activeDb.run("PRAGMA journal_mode = WAL");
    activeDb.run("PRAGMA foreign_keys = ON");

    const orm = drizzle(activeDb, { schema });
    migrate(orm, {
      migrationsFolder: resolve(import.meta.dirname, "../drizzle"),
    });

    // 2. Insere dados sintéticos (espaços, usuários e reservas)
    const nowIso = "2026-11-04T10:00:00.000Z";

    await orm.insert(schema.users).values([
      {
        id: "usr-docente-01",
        email: "alice@ifsc.edu.br",
        name: "Profa. Alice Martins",
        code: "ALM",
        roles: "docente",
        passwordHash: "scrypt$fakehash123",
        active: true,
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      {
        id: "usr-admin-01",
        email: "admin@ifsc.edu.br",
        name: "Coordenador Carlos",
        code: "CRD",
        roles: "admin",
        passwordHash: "scrypt$fakehash456",
        active: true,
        createdAt: nowIso,
        updatedAt: nowIso,
      },
    ]);

    await orm.insert(schema.spaces).values([
      {
        id: "sp-lab-redes",
        name: "Laboratório de Redes",
        capacity: 32,
        createdAt: nowIso,
      },
      {
        id: "sp-auditorio-a",
        name: "Auditório Central",
        capacity: 150,
        createdAt: nowIso,
      },
    ]);

    // Registro alvo específico para teste de ponta a ponta
    const targetBooking = {
      id: "occ-target-reserva-42",
      spaceId: "sp-lab-redes",
      startsAt: "2026-11-10T13:30:00",
      endsAt: "2026-11-10T15:10:00",
      source: "manual" as const,
      title: "Aula Prática de Arquitetura de Redes",
      status: "ativa" as const,
      createdBy: "usr-docente-01",
      responsibleUserId: "usr-docente-01",
      createdAt: nowIso,
    };

    const secondaryBooking = {
      id: "occ-secundaria-99",
      spaceId: "sp-auditorio-a",
      startsAt: "2026-11-11T09:00:00",
      endsAt: "2026-11-11T12:00:00",
      source: "manual" as const,
      title: "Seminário de Integração Tecnológica",
      status: "ativa" as const,
      createdBy: "usr-admin-01",
      responsibleUserId: "usr-admin-01",
      createdAt: nowIso,
    };

    await orm.insert(schema.occupations).values([targetBooking, secondaryBooking]);

    // Confere contagens iniciais
    const initialSpaces = (
      activeDb.query("SELECT count(*) as count FROM spaces").get() as { count: number }
    ).count;
    const initialUsers = (
      activeDb.query("SELECT count(*) as count FROM users").get() as { count: number }
    ).count;
    const initialOccupations = (
      activeDb.query("SELECT count(*) as count FROM occupations").get() as { count: number }
    ).count;

    expect(initialSpaces).toBe(2);
    expect(initialUsers).toBe(2);
    expect(initialOccupations).toBe(2);

    // 3. Executa backup com o banco ativo em modo WAL (simulando servidor rodando)
    const backupExitCode = await runBackup(["--out", backupFilePath, "--db-path", activeDbPath]);
    expect(backupExitCode).toBe(0);

    // Verifica que o arquivo de backup foi gerado e é íntegro
    expect(existsSync(backupFilePath)).toBe(true);
    expect(statSync(backupFilePath).size).toBeGreaterThan(0);

    const checkBackupDb = new Database(backupFilePath, { readonly: true });
    const backupCheck = checkBackupDb.query("PRAGMA integrity_check").all() as Array<{
      integrity_check: string;
    }>;
    expect(backupCheck).toEqual([{ integrity_check: "ok" }]);
    checkBackupDb.close(true);

    // 4. Modifica e apaga registros no banco ativo
    activeDb.run("DELETE FROM occupations;");
    activeDb.run("DELETE FROM spaces WHERE id = 'sp-auditorio-a';");
    activeDb.run("UPDATE users SET name = 'Nome Alterado' WHERE id = 'usr-docente-01';");

    const degradedOccupations = (
      activeDb.query("SELECT count(*) as count FROM occupations").get() as { count: number }
    ).count;
    const degradedSpaces = (
      activeDb.query("SELECT count(*) as count FROM spaces").get() as { count: number }
    ).count;

    expect(degradedOccupations).toBe(0);
    expect(degradedSpaces).toBe(1);

    // Fecha o banco ativo simulando parada do servidor para a restauração
    activeDb.close(true);

    // 5. Executa restore a partir do backup com confirmação (--yes)
    const restoreExitCode = await runRestore([
      "--from",
      backupFilePath,
      "--target",
      activeDbPath,
      "--yes",
    ]);
    expect(restoreExitCode).toBe(0);

    // Verifica que a cópia de segurança pré-restauração (<active>.bak-<timestamp>) foi gerada
    const filesInDir = readdirSync(tempDir);
    const hasSafetyBak = filesInDir.some((f) => f.startsWith("active.sqlite.bak-"));
    expect(hasSafetyBak).toBe(true);

    // 6. Abre o banco restaurado e valida recuperação integral
    const restoredDb = new Database(activeDbPath);
    const postCheck = restoredDb.query("PRAGMA integrity_check").all() as Array<{
      integrity_check: string;
    }>;
    expect(postCheck).toEqual([{ integrity_check: "ok" }]);

    const restoredSpaces = (
      restoredDb.query("SELECT count(*) as count FROM spaces").get() as { count: number }
    ).count;
    const restoredUsers = (
      restoredDb.query("SELECT count(*) as count FROM users").get() as { count: number }
    ).count;
    const restoredOccupations = (
      restoredDb.query("SELECT count(*) as count FROM occupations").get() as { count: number }
    ).count;

    expect(restoredSpaces).toBe(2);
    expect(restoredUsers).toBe(2);
    expect(restoredOccupations).toBe(2);

    // Valida o registro de reserva alvo em detalhes
    const foundTarget = restoredDb
      .query("SELECT * FROM occupations WHERE id = $id")
      .get({ $id: "occ-target-reserva-42" }) as Record<string, unknown>;

    expect(foundTarget).not.toBeNull();
    expect(foundTarget.id).toBe(targetBooking.id);
    expect(foundTarget.title).toBe(targetBooking.title);
    expect(foundTarget.space_id).toBe(targetBooking.spaceId);
    expect(foundTarget.starts_at).toBe(targetBooking.startsAt);
    expect(foundTarget.ends_at).toBe(targetBooking.endsAt);
    expect(foundTarget.status).toBe("ativa");
    expect(foundTarget.created_by).toBe("usr-docente-01");

    // Valida que o nome do usuário voltou ao original
    const restoredUser = restoredDb
      .query("SELECT name FROM users WHERE id = 'usr-docente-01'")
      .get() as { name: string };
    expect(restoredUser.name).toBe("Profa. Alice Martins");

    restoredDb.close(true);
  });

  test("Rejeita arquivo corrompido sem danificar o banco de dados ativo", async () => {
    const corruptPath = join(tempDir, "corrupted.sqlite");
    writeFileSync(corruptPath, Buffer.from("ESTE NAO E UM ARQUIVO SQLITE VALIDO DE FORMA ALGUMA"));

    const exitCode = await runRestore(["--from", corruptPath, "--target", activeDbPath, "--yes"]);

    expect(exitCode).toBe(1);

    // O banco de dados ativo deve continuar íntegro e legível
    const activeDb = new Database(activeDbPath, { readonly: true });
    const check = activeDb.query("PRAGMA integrity_check").all() as Array<{
      integrity_check: string;
    }>;
    expect(check).toEqual([{ integrity_check: "ok" }]);

    const count = (
      activeDb.query("SELECT count(*) as count FROM occupations").get() as { count: number }
    ).count;
    expect(count).toBe(2);
    activeDb.close(true);
  });

  test("Rejeita arquivo vazio e banco SQLite que não é cópia do sistema", async () => {
    const emptyPath = join(tempDir, "vazio.sqlite");
    writeFileSync(emptyPath, Buffer.alloc(0));
    const foreignPath = join(tempDir, "outro-banco.sqlite");
    const foreign = new Database(foreignPath);
    foreign.run("CREATE TABLE notas (id INTEGER PRIMARY KEY)");
    foreign.close(true);

    expect(await runRestore(["--from", emptyPath, "--target", activeDbPath, "--yes"])).toBe(1);
    expect(await runRestore(["--from", foreignPath, "--target", activeDbPath, "--yes"])).toBe(1);

    const activeDb = new Database(activeDbPath, { readonly: true });
    const count = (
      activeDb.query("SELECT count(*) as count FROM occupations").get() as { count: number }
    ).count;
    expect(count).toBe(2);
    activeDb.close(true);
  });

  test("Trata opções inválidas e ausência de argumentos com código de erro 1", async () => {
    // Sem --out
    const r1 = await runBackup([]);
    expect(r1).toBe(1);

    // Sem --from
    const r2 = await runRestore([]);
    expect(r2).toBe(1);

    // Arquivo inexistente
    const r3 = await runRestore([
      "--from",
      join(tempDir, "nao-existe.sqlite"),
      "--target",
      activeDbPath,
      "--yes",
    ]);
    expect(r3).toBe(1);

    // Origem igual ao destino
    const r4 = await runRestore(["--from", activeDbPath, "--target", activeDbPath, "--yes"]);
    expect(r4).toBe(1);

    // Sem confirmação --yes em ambiente não interativo
    const r5 = await runRestore(["--from", backupFilePath, "--target", activeDbPath]);
    expect(r5).toBe(1);
  });
});
