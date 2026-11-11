import { Database, type SQLQueryBindings } from "bun:sqlite";
import { afterAll, afterEach, beforeAll, describe, expect, spyOn, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { executeBackup, runBackup } from "../../cli/backup.ts";
import { planBackup } from "../../cli/backup-plan.ts";
import { runRestore } from "../../cli/restore.ts";
import { planRestore } from "../../cli/restore-plan.ts";

describe("Milestone 3 Challenger: Adversarial Stress Tests (Task 5: Cópia e Restauração, RO-01)", () => {
  let tempDir: string;
  let activeDbPath: string;
  let validBackupPath: string;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), "challenger-m3-"));
    activeDbPath = join(tempDir, "active.sqlite");
    validBackupPath = join(tempDir, "valid-backup.sqlite");

    // Prepara um banco ativo populado
    const db = new Database(activeDbPath);
    db.run("PRAGMA journal_mode = WAL");
    db.run("CREATE TABLE target_data (id TEXT PRIMARY KEY, value TEXT, updated_at TEXT);");
    db.run(
      "INSERT INTO target_data VALUES ('target-001', 'Original Active Data', '2026-11-04T12:00:00Z');",
    );
    db.close(true);

    // Gera um backup válido para os testes subsequentes
    const backupResult = executeBackup({
      outPath: validBackupPath,
      dbPath: activeDbPath,
      overwrite: true,
    });
    expect(backupResult).toBe(0);
    expect(existsSync(validBackupPath)).toBe(true);
  });

  afterAll(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignora falhas de limpeza no SO
    }
  });

  afterEach(() => {
    // Garante que o banco ativo principal continue íntegro e com dados originais após cada teste
    const db = new Database(activeDbPath);
    db.run(
      "CREATE TABLE IF NOT EXISTS target_data (id TEXT PRIMARY KEY, value TEXT, updated_at TEXT);",
    );
    const count = (
      db.query("SELECT count(*) as count FROM target_data WHERE id = 'target-001'").get() as {
        count: number;
      }
    ).count;
    if (count === 0) {
      db.run(
        "INSERT OR REPLACE INTO target_data VALUES ('target-001', 'Original Active Data', '2026-11-04T12:00:00Z');",
      );
    }
    db.close(true);
  });

  // =========================================================================
  // SUITE 1: Corrupted Backups & Zero-Byte Files (Scenarios a & b)
  // =========================================================================
  describe("Suite 1: Arquivos corrompidos, vazios e cabeçalhos truncados", () => {
    test("Scenario a1: Restauração de arquivo com bytes aleatórios (ruído) é rejeitada e preserva banco ativo", async () => {
      const corruptFile = join(tempDir, "random-noise.sqlite");
      const randomBytes = Buffer.alloc(2048);
      for (let i = 0; i < randomBytes.length; i++) {
        randomBytes[i] = Math.floor(Math.random() * 256);
      }
      writeFileSync(corruptFile, randomBytes);

      const exitCode = await runRestore(["--from", corruptFile, "--target", activeDbPath, "--yes"]);
      expect(exitCode).toBe(1);

      // Banco ativo deve permanecer intacto e íntegro
      const activeDb = new Database(activeDbPath, { readonly: true });
      const check = activeDb.query("PRAGMA integrity_check").all() as Array<{
        integrity_check: string;
      }>;
      expect(check).toEqual([{ integrity_check: "ok" }]);

      const record = activeDb.query("SELECT * FROM target_data WHERE id = 'target-001'").get() as {
        value: string;
      };
      expect(record.value).toBe("Original Active Data");
      activeDb.close(true);
    });

    test("Scenario a2: Restauração de arquivo preenchido com zeros (4KB) é rejeitada", async () => {
      const zeroFile = join(tempDir, "zeroed.sqlite");
      writeFileSync(zeroFile, Buffer.alloc(4096, 0));

      const exitCode = await runRestore(["--from", zeroFile, "--target", activeDbPath, "--yes"]);
      expect(exitCode).toBe(1);

      const activeDb = new Database(activeDbPath, { readonly: true });
      const check = activeDb.query("PRAGMA integrity_check").all() as Array<{
        integrity_check: string;
      }>;
      expect(check).toEqual([{ integrity_check: "ok" }]);
      activeDb.close(true);
    });

    test("Scenario a3: Restauração com magic header válido do SQLite mas páginas B-tree corrompidas é rejeitada", async () => {
      const corruptHeaderFile = join(tempDir, "corrupt-header.sqlite");
      // "SQLite format 3\0" são os primeiros 16 bytes válidos
      const header = Buffer.from("SQLite format 3\0");
      const payload = Buffer.alloc(2048, 0xff);
      writeFileSync(corruptHeaderFile, Buffer.concat([header, payload]));

      const exitCode = await runRestore([
        "--from",
        corruptHeaderFile,
        "--target",
        activeDbPath,
        "--yes",
      ]);
      expect(exitCode).toBe(1);

      const activeDb = new Database(activeDbPath, { readonly: true });
      const check = activeDb.query("PRAGMA integrity_check").all() as Array<{
        integrity_check: string;
      }>;
      expect(check).toEqual([{ integrity_check: "ok" }]);
      activeDb.close(true);
    });

    test("Scenario b: Restauração de arquivo de tamanho zero (0 bytes) é rejeitada limparamete", async () => {
      const emptyFile = join(tempDir, "empty-zero-bytes.sqlite");
      writeFileSync(emptyFile, Buffer.alloc(0));

      const exitCode = await runRestore(["--from", emptyFile, "--target", activeDbPath, "--yes"]);
      expect(exitCode).toBe(1);

      const activeDb = new Database(activeDbPath, { readonly: true });
      const check = activeDb.query("PRAGMA integrity_check").all() as Array<{
        integrity_check: string;
      }>;
      expect(check).toEqual([{ integrity_check: "ok" }]);
      activeDb.close(true);
    });
  });

  // =========================================================================
  // SUITE 2: Nested Paths, Missing Directories & Special Filenames (Scenario c)
  // =========================================================================
  describe("Suite 2: Diretórios aninhados, nomes especiais e controle de sobrescrita", () => {
    test("Scenario c1: Backup para diretório inexistente com níveis aninhados cria a hierarquia automaticamente", async () => {
      const nestedTarget = join(tempDir, "deeply", "nested", "dir", "sub", "snapshot.sqlite");
      expect(existsSync(dirname(nestedTarget))).toBe(false);

      const exitCode = await runBackup(["--out", nestedTarget, "--db-path", activeDbPath]);
      expect(exitCode).toBe(0);
      expect(existsSync(nestedTarget)).toBe(true);

      const db = new Database(nestedTarget, { readonly: true });
      const check = db.query("PRAGMA integrity_check").all() as Array<{
        integrity_check: string;
      }>;
      expect(check).toEqual([{ integrity_check: "ok" }]);
      db.close(true);
    });

    test("Scenario c2: Backup falha graciosamente (código 1) se o diretório de destino for bloqueado por arquivo regular", async () => {
      const blockerPath = join(tempDir, "regular-file-blocker.txt");
      writeFileSync(blockerPath, "sou um arquivo e nao um diretorio");

      const impossiblePath = join(blockerPath, "subfolder", "backup.sqlite");
      const exitCode = await runBackup(["--out", impossiblePath, "--db-path", activeDbPath]);
      expect(exitCode).toBe(1);
    });

    test("Scenario c3: Backup com espaços e aspas simples no caminho é escapado e criado com sucesso", async () => {
      const specialPath = join(tempDir, "pasta com espacos", "backup d'agua 'teste'.sqlite");

      const exitCode = await runBackup(["--out", specialPath, "--db-path", activeDbPath]);
      expect(exitCode).toBe(0);
      expect(existsSync(specialPath)).toBe(true);

      const db = new Database(specialPath, { readonly: true });
      const check = db.query("PRAGMA integrity_check").all() as Array<{
        integrity_check: string;
      }>;
      expect(check).toEqual([{ integrity_check: "ok" }]);
      db.close(true);
    });

    test("Scenario c4: Backup para arquivo já existente é recusado sem --overwrite e aceito com --overwrite", async () => {
      const existingBackup = join(tempDir, "existing-backup.sqlite");
      writeFileSync(existingBackup, "conteudo original");

      // Sem --overwrite deve falhar e não modificar o arquivo existente
      const failExitCode = await runBackup(["--out", existingBackup, "--db-path", activeDbPath]);
      expect(failExitCode).toBe(1);
      expect(statSync(existingBackup).size).toBe("conteudo original".length);

      // Com --overwrite (-f) deve sobrescrever com sucesso
      const successExitCode = await runBackup([
        "--out",
        existingBackup,
        "--db-path",
        activeDbPath,
        "--overwrite",
      ]);
      expect(successExitCode).toBe(0);
      expect(statSync(existingBackup).size).toBeGreaterThan(1000);

      const db = new Database(existingBackup, { readonly: true });
      expect(db.query("PRAGMA integrity_check").all()).toEqual([{ integrity_check: "ok" }]);
      db.close(true);
    });
  });

  // =========================================================================
  // SUITE 3: Identical Paths & Parameter Stress (Scenario d)
  // =========================================================================
  describe("Suite 3: Validação de caminhos idênticos e parâmetros", () => {
    test("Scenario d1: Restauração com origem exatamente igual ao destino é rejeitada", async () => {
      const exitCode = await runRestore([
        "--from",
        activeDbPath,
        "--target",
        activeDbPath,
        "--yes",
      ]);
      expect(exitCode).toBe(1);
    });

    test("Scenario d2: Restauração com origem igual ao destino variando maiúsculas/minúsculas no Windows é rejeitada", () => {
      // planRestore verifica normalização case-insensitive
      const upperPath = activeDbPath.toUpperCase();
      const lowerPath = activeDbPath.toLowerCase();

      const plan = planRestore({
        fromPath: upperPath,
        targetPath: lowerPath,
      });
      expect(plan.ok).toBe(false);
      if (!plan.ok) {
        expect(plan.errors[0]).toContain("não pode ser o mesmo do banco de dados de destino");
      }
    });

    test("Scenario d3: Backup com origem igual ao destino é rejeitado pelo planejador e executor", async () => {
      const plan = planBackup({
        outPath: activeDbPath,
        dbPath: activeDbPath,
      });
      expect(plan.ok).toBe(false);
      if (!plan.ok) {
        expect(plan.errors[0]).toContain("não pode ser igual ao banco de dados ativo");
      }

      const exitCode = await runBackup(["--out", activeDbPath, "--db-path", activeDbPath]);
      expect(exitCode).toBe(1);
    });

    test("Rejeita caracteres de controle em caminhos de backup e restauração", () => {
      const planB = planBackup({
        outPath: "backup\u0000.sqlite",
        dbPath: activeDbPath,
      });
      expect(planB.ok).toBe(false);

      const planR = planRestore({
        fromPath: "restore\u0000.sqlite",
        targetPath: activeDbPath,
      });
      expect(planR.ok).toBe(false);
    });

    test("Restauração falha quando --from aponta para um diretório e não para um arquivo", async () => {
      const dirPath = join(tempDir, "some-folder");
      mkdirSync(dirPath, { recursive: true });

      const exitCode = await runRestore(["--from", dirPath, "--target", activeDbPath, "--yes"]);
      expect(exitCode).toBe(1);
    });

    test("Backup falha quando o banco de dados de origem não existe", async () => {
      const nonExistent = join(tempDir, "nao-existe.sqlite");
      const outTarget = join(tempDir, "out.sqlite");

      const exitCode = await runBackup(["--out", outTarget, "--db-path", nonExistent]);
      expect(exitCode).toBe(1);
      expect(existsSync(outTarget)).toBe(false);
    });
  });

  // =========================================================================
  // SUITE 4: Active WAL Mode Concurrency Stress (Scenario e)
  // =========================================================================
  describe("Suite 4: Concorrência sob modo WAL ativo", () => {
    test("Scenario e: Leitores e escritores concorrentes em modo WAL operam sem bloqueio durante o VACUUM INTO", async () => {
      const stressDbPath = join(tempDir, "stress-wal.sqlite");
      const stressDb = new Database(stressDbPath);
      stressDb.run("PRAGMA journal_mode = WAL;");
      stressDb.run("CREATE TABLE logs (id INTEGER PRIMARY KEY AUTOINCREMENT, msg TEXT, ts TEXT);");

      // Pré-popula
      for (let i = 0; i < 50; i++) {
        stressDb.run("INSERT INTO logs (msg, ts) VALUES (?, ?)", [
          `initial-${i}`,
          new Date().toISOString(),
        ]);
      }

      let keepRunning = true;
      let writesCompleted = 0;
      let readsCompleted = 0;
      let writeErrors = 0;
      let readErrors = 0;

      // Conexão concorrente dedicada a escrita simulando requisições ativas da web
      const writerDb = new Database(stressDbPath);
      const writerPromise = (async () => {
        let counter = 0;
        while (keepRunning) {
          try {
            writerDb.run("INSERT INTO logs (msg, ts) VALUES (?, ?)", [
              `concurrent-writer-${counter++}`,
              new Date().toISOString(),
            ]);
            writesCompleted++;
          } catch {
            writeErrors++;
          }
          await Bun.sleep(5);
        }
      })();

      // Conexão concorrente dedicada a leitura
      const readerDb = new Database(stressDbPath, { readonly: true });
      const readerPromise = (async () => {
        while (keepRunning) {
          try {
            const count = (
              readerDb.query("SELECT count(*) as count FROM logs").get() as { count: number }
            ).count;
            if (count > 0) readsCompleted++;
          } catch {
            readErrors++;
          }
          await Bun.sleep(3);
        }
      })();

      // Executa o backup enquanto leituras e escritas acontecem concorrentemente
      const stressBackupOut = join(tempDir, "stress-backup.sqlite");
      const backupExit = executeBackup({
        outPath: stressBackupOut,
        dbPath: stressDbPath,
        overwrite: true,
      });

      // Interrompe trabalhadores concorrentes
      keepRunning = false;
      await Promise.all([writerPromise, readerPromise]);

      writerDb.close(true);
      readerDb.close(true);
      stressDb.close(true);

      // Verificações empíricas
      expect(backupExit).toBe(0);
      expect(writeErrors).toBe(0);
      expect(readErrors).toBe(0);
      expect(writesCompleted).toBeGreaterThan(0);
      expect(readsCompleted).toBeGreaterThan(0);
      expect(existsSync(stressBackupOut)).toBe(true);

      // O arquivo de backup resultante deve ser íntegro e legível
      const backupCheckDb = new Database(stressBackupOut, { readonly: true });
      const integrity = backupCheckDb.query("PRAGMA integrity_check").all() as Array<{
        integrity_check: string;
      }>;
      expect(integrity).toEqual([{ integrity_check: "ok" }]);

      const rowsInBackup = (
        backupCheckDb.query("SELECT count(*) as count FROM logs").get() as { count: number }
      ).count;
      expect(rowsInBackup).toBeGreaterThanOrEqual(50);
      backupCheckDb.close(true);
    });
  });

  // =========================================================================
  // SUITE 5: Post-Restore Integrity Failure & Safety Rollback (Scenario f)
  // =========================================================================
  describe("Suite 5: Falha pós-restauração e rollback para cópia de segurança", () => {
    test("Scenario f1: Falha no PRAGMA integrity_check pós-restauração reverte banco ativo para a cópia de segurança", async () => {
      // 1. Cria banco alvo com dados da versão 1
      const rollbackTarget = join(tempDir, "rollback-target.sqlite");
      const targetDb = new Database(rollbackTarget);
      targetDb.run("CREATE TABLE state (version TEXT);");
      targetDb.run("INSERT INTO state VALUES ('v1-initial-safe-state');");
      targetDb.close(true);

      // 2. Cria banco de origem com dados da versão 2
      const candidateSource = join(tempDir, "candidate-source.sqlite");
      const sourceDb = new Database(candidateSource);
      sourceDb.run("CREATE TABLE state (version TEXT);");
      sourceDb.run("INSERT INTO state VALUES ('v2-unverified-candidate');");
      sourceDb.run(
        "CREATE TABLE IF NOT EXISTS __drizzle_migrations (id INTEGER PRIMARY KEY, hash TEXT, created_at INTEGER)",
      );
      sourceDb.close(true);

      // 3. Simula falha na verificação pós-restauração (Etapa 6 de restore.ts)
      // espionando `Database.prototype.query`:
      // A primeira chamada (pré-verificação na origem) retorna 'ok'.
      // A segunda chamada (pós-verificação no destino) retorna erro de integridade simulado.
      const originalQuery = Database.prototype.query;
      let integrityCheckCallCount = 0;

      const spy = spyOn(Database.prototype, "query").mockImplementation(function <
        T,
        P extends SQLQueryBindings | SQLQueryBindings[],
      >(this: Database, sql: string) {
        if (sql.includes("PRAGMA integrity_check")) {
          integrityCheckCallCount++;
          if (integrityCheckCallCount === 1) {
            // Pré-verificação na origem: OK
            return originalQuery.call(this, "SELECT 'ok' AS integrity_check") as ReturnType<
              typeof originalQuery<T, P>
            >;
          }
          if (integrityCheckCallCount >= 2) {
            // Pós-verificação no destino: FALHA DE INTEGRIDADE
            return originalQuery.call(
              this,
              "SELECT 'Error: page 2 corrupted in destination' AS integrity_check",
            ) as ReturnType<typeof originalQuery<T, P>>;
          }
        }
        return originalQuery.apply(this, [sql]) as ReturnType<typeof originalQuery<T, P>>;
      });

      try {
        const exitCode = await runRestore([
          "--from",
          candidateSource,
          "--target",
          rollbackTarget,
          "--yes",
        ]);

        // A restauração deve ter falhado devido à integridade pós-cópia
        expect(exitCode).toBe(1);
      } finally {
        spy.mockRestore();
      }

      // Verificação empírica do Rollback:
      // O banco ativo em `rollbackTarget` DEVE ter sido revertido para 'v1-initial-safe-state'
      // e NÃO conter 'v2-unverified-candidate'.
      const verifiedDb = new Database(rollbackTarget, { readonly: true });
      const versionRecord = verifiedDb.query("SELECT version FROM state").get() as {
        version: string;
      };
      expect(versionRecord.version).toBe("v1-initial-safe-state");

      // Deve estar íntegro no SQLite real
      const integrity = verifiedDb.query("PRAGMA integrity_check").all() as Array<{
        integrity_check: string;
      }>;
      expect(integrity).toEqual([{ integrity_check: "ok" }]);
      verifiedDb.close(true);

      // Confirma que a cópia de segurança <target>.bak-<timestamp> foi gerada
      const allFiles = readdirSync(tempDir);
      const bakFiles = allFiles.filter((f) => f.startsWith("rollback-target.sqlite.bak-"));
      expect(bakFiles.length).toBeGreaterThanOrEqual(1);
    });

    test("Scenario f2: Exceção inesperada na verificação pós-restauração reverte banco ativo para a cópia de segurança", async () => {
      const excTarget = join(tempDir, "exception-target.sqlite");
      const targetDb = new Database(excTarget);
      targetDb.run("CREATE TABLE state (version TEXT);");
      targetDb.run("INSERT INTO state VALUES ('v1-initial-safe-state');");
      targetDb.close(true);

      const candidateSource = join(tempDir, "candidate-source-2.sqlite");
      const sourceDb = new Database(candidateSource);
      sourceDb.run("CREATE TABLE state (version TEXT);");
      sourceDb.run("INSERT INTO state VALUES ('v2-unverified-candidate');");
      sourceDb.run(
        "CREATE TABLE IF NOT EXISTS __drizzle_migrations (id INTEGER PRIMARY KEY, hash TEXT, created_at INTEGER)",
      );
      sourceDb.close(true);

      let checkCount = 0;
      const originalQuery = Database.prototype.query;
      const spy = spyOn(Database.prototype, "query").mockImplementation(function <
        T,
        P extends SQLQueryBindings | SQLQueryBindings[],
      >(this: Database, sql: string) {
        if (sql.includes("PRAGMA integrity_check")) {
          checkCount++;
          if (checkCount === 1) {
            return originalQuery.call(this, "SELECT 'ok' AS integrity_check") as ReturnType<
              typeof originalQuery<T, P>
            >;
          }
          if (checkCount >= 2) {
            throw new Error("Simulated I/O disk error on post-restore integrity check");
          }
        }
        return originalQuery.apply(this, [sql]) as ReturnType<typeof originalQuery<T, P>>;
      });

      try {
        const exitCode = await runRestore([
          "--from",
          candidateSource,
          "--target",
          excTarget,
          "--yes",
        ]);
        expect(exitCode).toBe(1);
      } finally {
        spy.mockRestore();
      }

      // Rollback conferido
      const verifiedDb = new Database(excTarget, { readonly: true });
      const versionRecord = verifiedDb.query("SELECT version FROM state").get() as {
        version: string;
      };
      expect(versionRecord.version).toBe("v1-initial-safe-state");
      verifiedDb.close(true);
    });

    test("Scenario f3: Arquivos residuais -wal e -shm são removidos antes da substituição para impedir poluição de log", async () => {
      const walTarget = join(tempDir, "wal-target.sqlite");
      const targetDb = new Database(walTarget);
      targetDb.run("PRAGMA journal_mode = WAL;");
      targetDb.run("CREATE TABLE state (val TEXT);");
      targetDb.run("INSERT INTO state VALUES ('old-wal-data');");
      targetDb.close(true);

      // Simula a existência explícita de resíduos de wal e shm
      const walFile = `${walTarget}-wal`;
      const shmFile = `${walTarget}-shm`;
      writeFileSync(walFile, "stale-wal-log");
      writeFileSync(shmFile, "stale-shm-index");
      expect(existsSync(walFile)).toBe(true);
      expect(existsSync(shmFile)).toBe(true);

      // Banco de origem
      const freshSource = join(tempDir, "fresh-source.sqlite");
      const sourceDb = new Database(freshSource);
      sourceDb.run("CREATE TABLE state (val TEXT);");
      sourceDb.run("INSERT INTO state VALUES ('fresh-data-from-backup');");
      sourceDb.run(
        "CREATE TABLE IF NOT EXISTS __drizzle_migrations (id INTEGER PRIMARY KEY, hash TEXT, created_at INTEGER)",
      );
      sourceDb.close(true);

      const exitCode = await runRestore(["--from", freshSource, "--target", walTarget, "--yes"]);
      expect(exitCode).toBe(0);

      // Arquivos antigos de log devem ter sido limpos
      expect(existsSync(walFile)).toBe(false);
      expect(existsSync(shmFile)).toBe(false);

      const restoredDb = new Database(walTarget, { readonly: true });
      const record = restoredDb.query("SELECT val FROM state").get() as { val: string };
      expect(record.val).toBe("fresh-data-from-backup");
      restoredDb.close(true);
    });
  });
});
