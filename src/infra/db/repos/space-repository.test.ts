import { Database } from "bun:sqlite";
import { beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { SpaceRepository } from "#/application/ports";
import { createSpacesService } from "#/application/spaces";
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

describe("SpaceRepository com equipamentos", () => {
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let repo: SpaceRepository;
  const equipped = {
    items: { projetor: 1, computadores: 20 },
    notes: "Lousa digital\nCaixa de som portátil",
  };

  beforeEach(() => {
    db = drizzle(new Database(":memory:"), { schema });
    migrate(db, { migrationsFolder: "drizzle" });
    repo = createSpaceRepository(db);
  });

  const countEquipment = async () => (await db.select().from(schema.spaceEquipment)).length;

  test("cria com equipamentos e lê; espaço sem equipamentos vem com tudo não informado", async () => {
    const lab = await repo.create({ name: "Lab 1", capacity: 30, equipment: equipped });
    expect(lab).toEqual({ id: lab.id, name: "Lab 1", capacity: 30, equipment: equipped });
    const plain = await repo.create({ name: "Auditório", capacity: null });
    expect(await repo.listWithEquipment()).toEqual([
      { id: plain.id, name: "Auditório", capacity: null, equipment: { items: {}, notes: null } },
      { id: lab.id, name: "Lab 1", capacity: 30, equipment: equipped },
    ]);
  });

  test("list() continua só com id, nome e capacidade", async () => {
    await repo.create({ name: "Lab 1", capacity: 30, equipment: equipped });
    const [first] = await repo.list();
    expect(Object.keys(first ?? {})).toEqual(["id", "name", "capacity"]);
  });

  test("tipo fora do catálogo gravado no banco é ignorado na leitura", async () => {
    const lab = await repo.create({ name: "Lab 1", capacity: null, equipment: equipped });
    await db.insert(schema.spaceEquipment).values({ spaceId: lab.id, kind: "lousa", quantity: 1 });
    const [read] = await repo.listWithEquipment();
    expect(read?.equipment?.items).toEqual({ projetor: 1, computadores: 20 });
  });

  test("editar com equipamentos substitui o conjunto inteiro e as observações", async () => {
    const lab = await repo.create({ name: "Lab 1", capacity: 30, equipment: equipped });
    const next = { items: { som: 0 }, notes: null };
    expect(await repo.update(lab.id, { name: "Lab Um", capacity: 25, equipment: next })).toEqual({
      id: lab.id,
      name: "Lab Um",
      capacity: 25,
      equipment: next,
    });
    expect(await repo.listWithEquipment()).toEqual([
      { id: lab.id, name: "Lab Um", capacity: 25, equipment: next },
    ]);
    expect(await countEquipment()).toBe(1);
  });

  test("editar sem equipamentos mantém equipamentos e observações", async () => {
    const lab = await repo.create({ name: "Lab 1", capacity: 30, equipment: equipped });
    await repo.update(lab.id, { name: "Lab Um", capacity: null });
    expect(await repo.listWithEquipment()).toEqual([
      { id: lab.id, name: "Lab Um", capacity: null, equipment: equipped },
    ]);
  });

  test("editar só observações mantém os equipamentos; só equipamentos mantém as observações", async () => {
    const lab = await repo.create({ name: "Lab 1", capacity: 30, equipment: equipped });
    expect(
      await repo.update(lab.id, { name: "Lab 1", capacity: 30, equipment: { notes: "TV" } }),
    ).toEqual({
      id: lab.id,
      name: "Lab 1",
      capacity: 30,
      equipment: { items: equipped.items, notes: "TV" },
    });
    expect(
      await repo.update(lab.id, { name: "Lab 1", capacity: 30, equipment: { items: { som: 1 } } }),
    ).toEqual({
      id: lab.id,
      name: "Lab 1",
      capacity: 30,
      equipment: { items: { som: 1 }, notes: "TV" },
    });
    expect(await countEquipment()).toBe(1);
  });

  test("criar só com observações grava os equipamentos como não informados", async () => {
    const lab = await repo.create({ name: "Lab 1", capacity: null, equipment: { notes: "TV" } });
    expect(await repo.listWithEquipment()).toEqual([
      { id: lab.id, name: "Lab 1", capacity: null, equipment: { items: {}, notes: "TV" } },
    ]);
  });

  test("nome duplicado ao editar desfaz também equipamentos e observações", async () => {
    const lab = await repo.create({ name: "Lab 1", capacity: 30, equipment: equipped });
    await repo.create({ name: "Lab 2", capacity: null });
    await expect(
      repo.update(lab.id, { name: "Lab 2", capacity: 1, equipment: { items: {}, notes: "x" } }),
    ).rejects.toThrow();
    const read = (await repo.listWithEquipment()).find((space) => space.id === lab.id);
    expect(read).toEqual({ id: lab.id, name: "Lab 1", capacity: 30, equipment: equipped });
  });

  test("nome duplicado ao criar não deixa equipamentos órfãos", async () => {
    await repo.create({ name: "Lab 1", capacity: null });
    await expect(
      repo.create({ name: "Lab 1", capacity: 1, equipment: equipped }),
    ).rejects.toThrow();
    expect(await countEquipment()).toBe(0);
  });

  describe("falha numa instrução posterior desfaz a gravação inteira", () => {
    // `equipped` grava projetor e depois computadores; o gatilho só aborta a segunda linha.
    const failOnComputers = () =>
      db.$client.run(
        `CREATE TRIGGER falha_computadores BEFORE INSERT ON space_equipment
         WHEN NEW.kind = 'computadores' BEGIN SELECT RAISE(ABORT, 'falha forçada'); END`,
      );

    test("ao criar, nem o espaço nem o primeiro equipamento ficam gravados", async () => {
      failOnComputers();
      await expect(
        repo.create({ name: "Lab 1", capacity: 30, equipment: equipped }),
      ).rejects.toThrow();
      expect(await repo.listWithEquipment()).toEqual([]);
      expect(await countEquipment()).toBe(0);
    });

    test("ao editar, nome, capacidade, observações e equipamentos anteriores ficam como estavam", async () => {
      const lab = await repo.create({
        name: "Lab 1",
        capacity: 30,
        equipment: { items: { som: 1 }, notes: "Antes" },
      });
      failOnComputers();
      await expect(
        repo.update(lab.id, { name: "Lab Um", capacity: 25, equipment: equipped }),
      ).rejects.toThrow();
      expect(await repo.listWithEquipment()).toEqual([
        {
          id: lab.id,
          name: "Lab 1",
          capacity: 30,
          equipment: { items: { som: 1 }, notes: "Antes" },
        },
      ]);
    });
  });

  test("editar espaço inexistente com equipamentos devolve null e não grava nada", async () => {
    expect(await repo.update("nao-existe", { name: "X", capacity: 1, equipment: equipped })).toBe(
      null,
    );
    expect(await countEquipment()).toBe(0);
  });
});

describe("SpaceRepository.remove", () => {
  let sqlite: Database;
  let repo: SpaceRepository;
  let spaceId: string;

  beforeEach(async () => {
    sqlite = new Database(":memory:");
    sqlite.run("PRAGMA foreign_keys = ON");
    const db = drizzle(sqlite, { schema });
    migrate(db, { migrationsFolder: "drizzle" });
    repo = createSpaceRepository(db);
    spaceId = (
      await repo.create({
        name: "Lab 1",
        capacity: null,
        equipment: { items: { projetor: 1 }, notes: "x" },
      })
    ).id;
  });

  const spacesLeft = () => sqlite.query("SELECT COUNT(*) AS total FROM spaces").get();
  const equipmentLeft = () => sqlite.query("SELECT COUNT(*) AS total FROM space_equipment").get();

  test("falha ao apagar o espaço desfaz a exclusão dos equipamentos", async () => {
    sqlite.run(
      `CREATE TRIGGER falha_espaco BEFORE DELETE ON spaces
       BEGIN SELECT RAISE(ABORT, 'falha forçada'); END`,
    );
    await expect(repo.remove(spaceId)).rejects.toThrow("falha forçada");
    expect(spacesLeft()).toEqual({ total: 1 });
    expect(equipmentLeft()).toEqual({ total: 1 });
  });

  test("espaço sem uso é apagado com os equipamentos", async () => {
    expect(await repo.remove(spaceId)).toBe("removed");
    expect(spacesLeft()).toEqual({ total: 0 });
    expect(equipmentLeft()).toEqual({ total: 0 });
  });

  test.each(["ativa", "cancelada"])("ocupação %s impede a exclusão", async (status) => {
    sqlite.run(
      `INSERT INTO occupations (id, space_id, starts_at, ends_at, source, title, status, created_at)
       VALUES ('o1', '${spaceId}', '2026-11-10T10:00', '2026-11-10T11:00', 'manual', 'Aula', '${status}', 't')`,
    );
    expect(await repo.remove(spaceId)).toBe("in_use");
    expect(spacesLeft()).toEqual({ total: 1 });
    expect(equipmentLeft()).toEqual({ total: 1 });
  });

  test("vínculo com sala do XML impede a exclusão", async () => {
    sqlite.run(
      `INSERT INTO room_mappings (source_room_id, source_short, space_id, updated_at)
       VALUES ('r1', 'LAB1', '${spaceId}', 't')`,
    );
    expect(await repo.remove(spaceId)).toBe("in_use");
    expect(spacesLeft()).toEqual({ total: 1 });
    expect(equipmentLeft()).toEqual({ total: 1 });
  });

  test("linha de importação que cita o espaço impede a exclusão", async () => {
    sqlite.run(
      `INSERT INTO users (id, email, name, roles, password_hash, active, created_at, updated_at)
       VALUES ('u1', 'a@x.br', 'A', 'admin', 'h', 1, 't', 't')`,
    );
    sqlite.run(
      `INSERT INTO semesters (id, name, starts_on, ends_on, created_at, updated_at)
       VALUES ('sem', '2026/2', '2026-08-03', '2026-12-18', 't', 't')`,
    );
    sqlite.run(
      `INSERT INTO import_batches (id, semester_id, file_hash, summary_json, status, created_by, created_at)
       VALUES ('b1', 'sem', 'h', '{}', 'rascunho', 'u1', 't')`,
    );
    sqlite.run(
      `INSERT INTO import_rows (batch_id, row_key, lesson_id, space_id, start_time, end_time, title, status)
       VALUES ('b1', 'k1', 'L1', '${spaceId}', '10:00', '11:00', 'Aula', 'pendente')`,
    );
    expect(await repo.remove(spaceId)).toBe("in_use");
    expect(spacesLeft()).toEqual({ total: 1 });
    expect(equipmentLeft()).toEqual({ total: 1 });
  });

  test("espaço inexistente devolve not_found", async () => {
    expect(await repo.remove("nao-existe")).toBe("not_found");
    expect(spacesLeft()).toEqual({ total: 1 });
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

describe("edição com o espaço excluído no meio", () => {
  test("a gravação devolve null e o serviço responde não encontrado", async () => {
    const dir = mkdtempSync(join(tmpdir(), "espacos-"));
    const path = join(dir, "db.sqlite");
    const sqlite = new Database(path);
    sqlite.run("PRAGMA foreign_keys = ON");
    const db = drizzle(sqlite, { schema });
    migrate(db, { migrationsFolder: "drizzle" });
    const repo = createSpaceRepository(db);
    const lab = await repo.create({
      name: "Lab 1",
      capacity: 10,
      equipment: { items: { projetor: 1 }, notes: "Lousa" },
    });
    const other = new Database(path);
    other.run("PRAGMA foreign_keys = ON");
    const original = sqlite.prepare.bind(sqlite);
    let armed = true;
    sqlite.prepare = ((sql: string) => {
      const statement = original(sql);
      const current = statement.values.bind(statement);
      statement.values = ((...args: Parameters<typeof current>) => {
        const rows = current(...args);
        if (armed && sql.startsWith("select") && rows.length > 0) {
          armed = false;
          other.run("DELETE FROM space_equipment WHERE space_id = ?", [lab.id]);
          other.run("DELETE FROM spaces WHERE id = ?", [lab.id]);
        }
        return rows;
      }) as typeof statement.values;
      return statement;
    }) as typeof sqlite.prepare;

    const input = {
      name: "Lab 2",
      capacity: 11,
      equipment: { items: { som: 1 }, notes: "Outra" },
    };
    expect(await repo.update(lab.id, input)).toBe(null);
    expect(await createSpacesService({ spaces: repo }).update(lab.id, input)).toMatchObject({
      ok: false,
      kind: "not_found",
      message: "Espaço não encontrado.",
    });
    other.close();
    sqlite.close();
  });
});
