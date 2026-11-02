import { Database } from "bun:sqlite";
import { beforeEach, describe, expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import type { SemesterRepository } from "#/application/ports";
import type { Semester } from "#/domain/semester";
import type { AppDb } from "#/infra/db/client";
import { createSemesterRepository } from "#/infra/db/repos/semester-repository";
import * as schema from "#/infra/db/schema";

const data: Omit<Semester, "id"> = {
  name: "2026.2",
  start: "2026-08-03",
  end: "2026-12-19",
  terms: [
    { position: 2, start: "2026-10-05", end: "2026-12-19" },
    { position: 1, start: "2026-08-03", end: "2026-10-03" },
  ],
  blocks: [
    { number: 7, name: "Noite 123", short: "N123", start: "19:00", end: "22:00" },
    { number: 5, name: "Noite 12", short: "N12", start: "18:00", end: "19:50" },
  ],
};

function open() {
  const sqlite = new Database(":memory:");
  sqlite.run("PRAGMA foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "drizzle" });
  return db;
}

describe("SemesterRepository (sem batch: bun:sqlite)", () => {
  let repo: SemesterRepository;
  let db: AppDb;

  beforeEach(() => {
    db = open();
    repo = createSemesterRepository(db);
  });

  test("cria e lê com durações e blocos ordenados", async () => {
    const created = await repo.create(data);
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(created.terms.map((t) => t.position)).toEqual([1, 2]);
    expect(created.blocks.map((b) => b.number)).toEqual([5, 7]);
    expect(await repo.findById(created.id)).toEqual(created);
    expect(await repo.list()).toEqual([created]);
    expect(await repo.findById("nao-existe")).toBeNull();
  });

  test("lista pelo início mais recente primeiro", async () => {
    const a = await repo.create({
      ...data,
      name: "A",
      start: "2026-02-02",
      end: "2026-06-30",
      terms: [],
    });
    const b = await repo.create({ ...data, name: "B", terms: [] });
    expect((await repo.list()).map((s) => s.id)).toEqual([b.id, a.id]);
  });

  test("replace substitui o conjunto de filhos (idempotente)", async () => {
    const created = await repo.create(data);
    const next = {
      name: "Renomeado",
      start: "2026-08-04",
      end: "2026-12-18",
      terms: [{ position: 3, start: "2026-09-01", end: "2026-09-30" }],
      blocks: [{ number: 5, name: "Mudou", short: "M", start: "08:00", end: "09:00" }],
    };
    const first = await repo.replace(created.id, next);
    expect(first).toEqual({ id: created.id, ...next });
    expect(await repo.replace(created.id, next)).toEqual(first);
    expect(await repo.replace(created.id, { ...next, terms: [], blocks: [] })).toMatchObject({
      terms: [],
      blocks: [],
    });
    expect(await repo.replace("nada", next)).toBeNull();
  });

  test("replace não mexe nos filhos de outro semestre", async () => {
    const a = await repo.create(data);
    const b = await repo.create({ ...data, name: "outro" });
    await repo.replace(a.id, { ...data, terms: [], blocks: [] });
    expect(await repo.findById(b.id)).toEqual(b);
  });

  test("nome duplicado (exato) é recusado pelo banco", async () => {
    await repo.create(data);
    await expect(repo.create(data)).rejects.toThrow();
  });

  test("aceita 30 blocos (uma linha por instrução, sem estourar parâmetros)", async () => {
    const blocks = Array.from({ length: 30 }, (_, i) => ({
      number: i + 1,
      name: `B${i + 1}`,
      short: `b${i + 1}`,
      start: "08:00",
      end: "09:00",
    }));
    const created = await repo.create({ ...data, blocks });
    expect(created.blocks).toHaveLength(30);
  });
});

describe("SemesterRepository (com db.batch, como no D1)", () => {
  test("usa batch para gravar tudo junto", async () => {
    const db = open();
    const batches: number[] = [];
    // Simula o `batch` do D1 (que roda tudo ou nada); aqui só registra o tamanho.
    const withBatch = Object.assign(db, {
      async batch(queries: Array<PromiseLike<unknown>>) {
        batches.push(queries.length);
        return Promise.all(queries);
      },
    });
    const repo = createSemesterRepository(withBatch);
    const created = await repo.create(data);
    expect(batches).toEqual([5]);
    await repo.replace(created.id, { ...data, terms: [], blocks: [] });
    expect(batches).toEqual([5, 3]);
    expect(await repo.findById(created.id)).toMatchObject({ terms: [], blocks: [] });
  });
});

describe("esquema dos filhos", () => {
  test("durações e blocos têm chave composta (semestre + posição/número)", () => {
    const keys = (table: Parameters<typeof getTableConfig>[0]) =>
      getTableConfig(table).primaryKeys.map((key) => key.columns.map((column) => column.name));
    expect(keys(schema.semesterTerms)).toEqual([["semester_id", "position"]]);
    expect(keys(schema.semesterBlocks)).toEqual([["semester_id", "number"]]);
  });
});

describe("chaves estrangeiras dos filhos", () => {
  test("apontam para semesters e apagam em cascata", () => {
    for (const table of [schema.semesterTerms, schema.semesterBlocks]) {
      const [fk] = getTableConfig(table).foreignKeys;
      expect(fk?.reference().foreignTable).toBe(schema.semesters);
      expect(fk?.onDelete).toBe("cascade");
    }
  });
});

describe("atomicidade (bun:sqlite)", () => {
  const dupBlocks = [
    { number: 1, name: "A", short: "A", start: "08:00", end: "09:00" },
    { number: 1, name: "B", short: "B", start: "09:00", end: "10:00" },
  ];

  test("replace que falha no meio mantém durações e blocos antigos", async () => {
    const repo = createSemesterRepository(open());
    const created = await repo.create(data);
    await expect(
      repo.replace(created.id, { ...data, name: "Mudou", terms: [], blocks: dupBlocks }),
    ).rejects.toThrow();
    expect(await repo.findById(created.id)).toEqual(created);
  });

  test("create que falha no meio não deixa semestre órfão e a repetição funciona", async () => {
    const repo = createSemesterRepository(open());
    await expect(repo.create({ ...data, blocks: dupBlocks })).rejects.toThrow();
    expect(await repo.list()).toEqual([]);
    const retry = await repo.create(data);
    expect(await repo.list()).toEqual([retry]);
  });
});
