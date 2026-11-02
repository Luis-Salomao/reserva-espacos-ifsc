import { Database } from "bun:sqlite";
import { beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { createImportReportService } from "#/application/import-report";
import { EMPTY_COUNTS, type ImportBatch, type ImportRow } from "#/domain/import-batch";
import { createImportRepository } from "#/infra/db/repos/import-repository";
import { createSemesterRepository } from "#/infra/db/repos/semester-repository";
import { createSpaceRepository } from "#/infra/db/repos/space-repository";
import { createUserRepository } from "#/infra/db/repos/user-repository";
import * as schema from "#/infra/db/schema";

const counts = {
  ...EMPTY_COUNTS,
  aplicada: 1,
  nao_aplicavel: 1,
  conflito: 1,
};

async function setup() {
  const sqlite = new Database(":memory:");
  sqlite.run("PRAGMA foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "drizzle" });
  const semesters = createSemesterRepository(db);
  const spaces = createSpaceRepository(db);
  const users = createUserRepository(db);
  const imports = createImportRepository(db);
  const semester = await semesters.create({
    name: "2026.2",
    start: "2026-08-03",
    end: "2026-12-19",
    terms: [],
    blocks: [],
  });
  const lab = await spaces.create({ name: "Laboratório 7", capacity: null });
  const room = await spaces.create({ name: "Sala 12", capacity: null });
  const teacher = await users.create({
    email: "p@x.org",
    name: "Profa. Exemplo",
    code: "PEX",
    roles: ["docente"],
    passwordHash: "x",
  });
  const batch: ImportBatch = {
    id: "b1",
    semesterId: semester.id,
    fileHash: "abcdef0123456789",
    summary: { rows: 3, notApplicable: { room_unmapped: 1 }, counts },
    planHash: null,
    status: "aplicado",
    createdBy: teacher.id,
    createdAt: "2026-11-02T10:00:00.000Z",
    appliedAt: "2026-11-02T10:01:00.000Z",
    supersedesBatchId: null,
  };
  await imports.insertBatch(batch);
  await db.insert(schema.occupations).values({
    id: "occ1",
    spaceId: room.id,
    startsAt: "2026-08-03T08:00",
    endsAt: "2026-08-03T09:00",
    source: "manual",
    title: "Reunião do colegiado",
    status: "ativa",
    createdAt: "t",
  });
  const base = {
    batchId: "b1",
    lessonId: "L1",
    weekday: 0,
    occupationId: null,
    conflictOccupationId: null,
    reasonCode: null,
    reasonDetail: null,
    changeKind: null,
    responsibleUserId: null,
  };
  const rows: ImportRow[] = [
    {
      ...base,
      rowKey: "o:1",
      spaceId: lab.id,
      date: "2026-08-03",
      startTime: "08:00",
      endTime: "09:50",
      title: "Algoritmos — T1A",
      responsibleUserId: teacher.id,
      status: "aplicada",
    },
    {
      ...base,
      rowKey: "o:2",
      spaceId: room.id,
      date: "2026-08-03",
      startTime: "08:30",
      endTime: "09:30",
      title: "Cálculo 100% — T2B",
      status: "conflito",
      reasonCode: "conflito_existente",
      reasonDetail: "Já existe uma ocupação ativa neste espaço e horário.",
      conflictOccupationId: "occ1",
    },
    {
      ...base,
      rowKey: "n:0",
      spaceId: null,
      date: null,
      startTime: "10:00",
      endTime: "11:00",
      title: "Física — T3C",
      status: "nao_aplicavel",
      reasonCode: "room_unmapped",
      reasonDetail: "A sala 202 não foi vinculada a um espaço.",
    },
  ];
  await imports.insertRows(rows);
  const report = createImportReportService({ imports, spaces, users, semesters });
  return { report, semesterId: semester.id, teacherId: teacher.id, imports, db };
}

type Env = Awaited<ReturnType<typeof setup>>;

async function page(env: Env, filter: Parameters<Env["report"]["rows"]>[1]) {
  const result = await env.report.rows("b1", filter);
  if (!result.ok) throw new Error(result.message);
  return result.value;
}

describe("relatório por linha do lote", () => {
  let env: Env;
  beforeEach(async () => {
    env = await setup();
  });

  test("lote desconhecido -> não encontrado", async () => {
    const result = await env.report.rows("nada", {});
    expect(result.ok).toBe(false);
  });

  test("devolve todas as linhas com nomes, total e motivos, sem expor o hash inteiro", async () => {
    const result = await page(env, {});
    expect(result.total).toBe(3);
    expect(result.batch.hashPrefix).toBe("abcdef01");
    expect(JSON.stringify(result.batch)).not.toContain("abcdef0123456789");
    expect(result.batch.semesterName).toBe("2026.2");
    const applied = result.rows.find((row) => row.rowKey === "o:1");
    expect(applied?.spaceName).toBe("Laboratório 7");
    expect(applied?.responsibleName).toBe("Profa. Exemplo");
    const conflict = result.rows.find((row) => row.rowKey === "o:2");
    expect(conflict?.conflictWith).toEqual({
      title: "Reunião do colegiado",
      startsAt: "2026-08-03T08:00",
      endsAt: "2026-08-03T09:00",
      fromEarlierBatch: false,
    });
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        { status: "nao_aplicavel", reasonCode: "room_unmapped", total: 1 },
        { status: "conflito", reasonCode: "conflito_existente", total: 1 },
        { status: "aplicada", reasonCode: null, total: 1 },
      ]),
    );
  });

  test("conflito com ocupação de lote anterior do mesmo semestre é marcado", async () => {
    const earlier: ImportBatch = {
      id: "b0",
      semesterId: env.semesterId,
      fileHash: "0000000011111111",
      summary: { rows: 0, notApplicable: {}, counts },
      planHash: null,
      status: "aplicado",
      createdBy: env.teacherId,
      createdAt: "2026-10-01T10:00:00.000Z",
      appliedAt: "2026-10-01T10:01:00.000Z",
      supersedesBatchId: null,
    };
    await env.imports.insertBatch(earlier);
    await env.db
      .update(schema.occupations)
      .set({ batchId: "b0", source: "import" })
      .where(eq(schema.occupations.id, "occ1"));
    const conflict = (await page(env, {})).rows.find((row) => row.rowKey === "o:2");
    expect(conflict?.conflictWith?.fromEarlierBatch).toBe(true);
    // Ocupação do próprio lote não conta como "versão anterior".
    await env.db
      .update(schema.occupations)
      .set({ batchId: "b1" })
      .where(eq(schema.occupations.id, "occ1"));
    const own = (await page(env, {})).rows.find((row) => row.rowKey === "o:2");
    expect(own?.conflictWith?.fromEarlierBatch).toBe(false);
  });

  test("filtra por situação, motivo e busca (título, sala e detalhe)", async () => {
    const keys = async (filter: Parameters<Env["report"]["rows"]>[1]) => {
      const result = await page(env, filter);
      return { keys: result.rows.map((row) => row.rowKey), total: result.total };
    };
    expect(await keys({ status: "conflito" })).toEqual({ keys: ["o:2"], total: 1 });
    expect(await keys({ reasonCode: "room_unmapped" })).toEqual({ keys: ["n:0"], total: 1 });
    expect(await keys({ search: "algoritmos" })).toEqual({ keys: ["o:1"], total: 1 });
    expect(await keys({ search: "sala 12" })).toEqual({ keys: ["o:2"], total: 1 });
    expect(await keys({ search: "202" })).toEqual({ keys: ["n:0"], total: 1 });
    expect(await keys({ status: "aplicada", search: "física" })).toEqual({ keys: [], total: 0 });
  });

  test("busca trata % e _ como texto comum", async () => {
    expect((await page(env, { search: "100%" })).rows.map((row) => row.rowKey)).toEqual(["o:2"]);
    expect((await page(env, { search: "%" })).total).toBe(1);
    expect((await page(env, { search: "_" })).total).toBe(0);
  });

  test("pagina pelo servidor com limite e deslocamento", async () => {
    const first = await page(env, { limit: 2, offset: 0 });
    const second = await page(env, { limit: 2, offset: 2 });
    expect(first.rows).toHaveLength(2);
    expect(second.rows).toHaveLength(1);
    expect(first.total).toBe(3);
    const clamped = await page(env, { limit: 99999, offset: -5 });
    expect(clamped.limit).toBe(200);
    expect(clamped.offset).toBe(0);
  });

  test("linhas sem data (não aplicáveis) vêm por último", async () => {
    const result = await page(env, {});
    expect(result.rows.map((row) => row.rowKey)).toEqual(["o:1", "o:2", "n:0"]);
  });

  test("lista os lotes com o nome do semestre", async () => {
    const list = await env.report.batches();
    expect(list).toHaveLength(1);
    expect(list[0]?.semesterName).toBe("2026.2");
    expect(list[0]?.summary.counts.aplicada).toBe(1);
  });
});
