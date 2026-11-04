import { Database } from "bun:sqlite";
import { beforeEach, describe, expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { SpaceRepository } from "#/application/ports";
import { createSpaceRepository } from "#/infra/db/repos/space-repository";
import * as schema from "#/infra/db/schema";

describe("SpaceRepository", () => {
  let repo: SpaceRepository;

  beforeEach(() => {
    const db = drizzle(new Database(":memory:"), { schema });
    migrate(db, { migrationsFolder: "drizzle" });
    repo = createSpaceRepository(db);
  });

  test("cria e lista espaço com capacidade não informada", async () => {
    const created = await repo.create({ name: "Lab 1", capacity: null });
    const all = await repo.list();
    expect(all).toHaveLength(1);
    expect(all[0]?.capacity).toBeNull();
    expect(all[0]).toEqual(created);
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  test("persiste capacidade informada", async () => {
    const created = await repo.create({ name: "Auditório", capacity: 80 });
    expect(created.capacity).toBe(80);
  });

  test("rejeita nome duplicado", async () => {
    await repo.create({ name: "Lab 1", capacity: null });
    await expect(repo.create({ name: "Lab 1", capacity: 10 })).rejects.toThrow();
  });

  test("atualiza nome e capacidade; retorna nulo se não existe; nome duplicado falha", async () => {
    const lab = await repo.create({ name: "Lab 1", capacity: 10 });
    await repo.create({ name: "Lab 2", capacity: null });
    expect(await repo.update(lab.id, { name: "Laboratório", capacity: null })).toEqual({
      id: lab.id,
      name: "Laboratório",
      capacity: null,
    });
    expect((await repo.list()).map((s) => s.name)).toEqual(["Lab 2", "Laboratório"]);
    expect(await repo.update("nao-existe", { name: "X", capacity: 1 })).toBeNull();
    await expect(repo.update(lab.id, { name: "Lab 2", capacity: 1 })).rejects.toThrow();
  });
});

describe("migração dos equipamentos", () => {
  type Journal = { entries: { idx: number; tag: string }[] };

  async function applyMigration(sqlite: Database, tag: string) {
    const sql = await Bun.file(`drizzle/${tag}.sql`).text();
    for (const statement of sql.split("--> statement-breakpoint")) {
      if (statement.trim() !== "") sqlite.run(statement);
    }
  }

  test("espaços que já existiam ficam intactos e com tudo não informado; excluir apaga os equipamentos", async () => {
    const journal: Journal = await Bun.file("drizzle/meta/_journal.json").json();
    const equipmentMigration = journal.entries.find((entry) => entry.idx === 9);
    expect(equipmentMigration).toBeDefined();
    const sqlite = new Database(":memory:");
    sqlite.run("PRAGMA foreign_keys = ON");
    for (const entry of journal.entries.filter((e) => e.idx < 9)) {
      await applyMigration(sqlite, entry.tag);
    }
    sqlite.run(
      "INSERT INTO spaces (id, name, capacity, created_at) VALUES ('s1', 'A-202', 40, 't'), ('s2', 'Auditório', NULL, 't')",
    );
    await applyMigration(sqlite, equipmentMigration?.tag ?? "");

    expect(
      sqlite.query("SELECT id, name, capacity, equipment_notes FROM spaces ORDER BY id").all(),
    ).toEqual([
      { id: "s1", name: "A-202", capacity: 40, equipment_notes: null },
      { id: "s2", name: "Auditório", capacity: null, equipment_notes: null },
    ]);
    expect(sqlite.query("SELECT COUNT(*) AS total FROM space_equipment").get()).toEqual({
      total: 0,
    });

    sqlite.run(
      "INSERT INTO space_equipment (space_id, kind, quantity) VALUES ('s1', 'projetor', 1)",
    );
    sqlite.run("DELETE FROM spaces WHERE id = 's1'");
    expect(sqlite.query("SELECT COUNT(*) AS total FROM space_equipment").get()).toEqual({
      total: 0,
    });
  });
});
