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

  test("filtra por tipo de mudança e expõe o tipo em cada linha", async () => {
    await env.db
      .update(schema.importRows)
      .set({ changeKind: "alteracao" })
      .where(eq(schema.importRows.rowKey, "o:2"));
    await env.db
      .update(schema.importRows)
      .set({ changeKind: "remocao" })
      .where(eq(schema.importRows.rowKey, "o:1"));
    const alteracao = await page(env, { changeKind: "alteracao" });
    expect(alteracao.rows.map((row) => [row.rowKey, row.changeKind])).toEqual([
      ["o:2", "alteracao"],
    ]);
    expect(alteracao.total).toBe(1);
    expect((await page(env, { changeKind: "remocao", status: "conflito" })).total).toBe(0);
    expect((await page(env, { changeKind: "inclusao" })).total).toBe(0);
    expect((await page(env, {})).rows.find((row) => row.rowKey === "n:0")?.changeKind).toBeNull();
  });

  test("lote de nova versão informa o lote substituído e os nomes das contas afetadas", async () => {
    await env.imports.insertBatch({
      id: "b2",
      semesterId: env.semesterId,
      fileHash: "ffff000011112222",
      summary: {
        rows: 0,
        notApplicable: {},
        counts,
        version: {
          supersedesBatchId: "b1",
          inclusoes: 0,
          alteracoes: 0,
          bloqueadas: 0,
          remocoes: 0,
          responsaveis: 0,
          inalteradas: 0,
          mantidasCanceladas: 0,
          affectedUserIds: [env.teacherId, "conta-removida"],
        },
      },
      planHash: null,
      status: "rascunho",
      createdBy: env.teacherId,
      createdAt: "2026-11-03T10:00:00.000Z",
      appliedAt: null,
      supersedesBatchId: "b1",
    });
    const second = await env.report.rows("b2", {});
    if (!second.ok) throw new Error(second.message);
    expect(second.value.batch.supersedesBatchId).toBe("b1");
    expect(second.value.batch.supersedesAppliedAt).toBe("2026-11-02T10:01:00.000Z");
    expect(second.value.batch.affectedNames).toEqual(["Profa. Exemplo"]);
    const listed = await env.report.batches();
    expect(listed.find((item) => item.id === "b2")?.supersedesAppliedAt).toBe(
      "2026-11-02T10:01:00.000Z",
    );
    expect(listed.find((item) => item.id === "b1")?.supersedesAppliedAt).toBeNull();
  });

  test("rascunho preparado sobre uma versão que já não é a última aparece como desatualizado", async () => {
    const draft = (id: string, hash: string, supersedes: string | null): ImportBatch => ({
      id,
      semesterId: env.semesterId,
      fileHash: hash,
      summary: { rows: 0, notApplicable: {}, counts },
      planHash: null,
      status: "rascunho",
      createdBy: env.teacherId,
      createdAt: "2026-11-03T10:00:00.000Z",
      appliedAt: null,
      supersedesBatchId: supersedes,
    });
    await env.imports.insertBatch(draft("d1", "1111000011112222", "b1"));
    expect((await env.report.batches()).find((b) => b.id === "d1")?.outdated).toBe(false);
    await env.imports.insertBatch({
      ...draft("b3", "3333000011112222", "b1"),
      status: "aplicado",
      appliedAt: "2026-11-03T11:00:00.000Z",
    });
    const listed = await env.report.batches();
    expect(listed.find((b) => b.id === "d1")?.outdated).toBe(true);
    expect(listed.find((b) => b.id === "b3")?.outdated).toBe(false);
    expect(listed.find((b) => b.id === "b1")?.outdated).toBe(false);
  });

  test("por grupo: nenhuma aula+data é cortada entre páginas, mesmo passando de 200 linhas", async () => {
    // 120 grupos (aula + data) de 2 linhas cada = 240 linhas, mais um grupo de 3 linhas (turmas
    // divididas: 2 cancelar, 1 inserir) que atravessa a antiga fronteira de 200 linhas.
    const base = {
      batchId: "b1",
      lessonId: "L9",
      weekday: 0,
      spaceId: null,
      occupationId: null,
      conflictOccupationId: null,
      reasonCode: null,
      reasonDetail: null,
      responsibleUserId: null,
      changeKind: "alteracao" as const,
      startTime: "08:00",
      endTime: "09:00",
    };
    const rows: ImportRow[] = [];
    for (let day = 0; day < 120; day++) {
      const date = `2027-${String(1 + Math.floor(day / 28)).padStart(2, "0")}-${String((day % 28) + 1).padStart(2, "0")}`;
      const title = day === 99 ? "Aula 099" : `Aula ${String(day).padStart(3, "0")}`;
      rows.push({ ...base, rowKey: `c:${day}`, date, title, status: "cancelar" });
      rows.push({
        ...base,
        rowKey: `o9:${day}`,
        date,
        title,
        status: "pendente",
        startTime: "10:00",
      });
    }
    rows.push({
      ...base,
      rowKey: "c:extra",
      date: "2027-01-01",
      title: "Aula 000",
      status: "cancelar",
      startTime: "09:00",
    });
    await env.imports.insertRows(rows);
    const first = await page(env, { changeKind: "alteracao", groups: true, limit: 100, offset: 0 });
    expect(first.total).toBe(120);
    expect(first.rows.length).toBe(201);
    const second = await page(env, {
      changeKind: "alteracao",
      groups: true,
      limit: 100,
      offset: 100,
    });
    expect(second.total).toBe(120);
    expect(second.rows.length).toBe(40);
    const keys = (r: { rows: { rowKey: string; date: string | null; title: string }[] }) =>
      new Set(r.rows.map((row) => `${row.date}|${row.title}`));
    for (const key of keys(first)) expect(keys(second).has(key)).toBe(false);
    // Todo grupo vem inteiro: o de 3 linhas (2 antes + 1 depois) não é cortado.
    const big = first.rows.filter((row) => row.date === "2027-01-01" && row.title === "Aula 000");
    expect(big.map((row) => row.rowKey)).toEqual(["c:0", "c:extra", "o9:0"]);
  });

  test("por grupo: ordem por data, título e horário; linhas sem data por último", async () => {
    await env.imports.insertRows([
      {
        batchId: "b1",
        lessonId: "L1",
        weekday: 0,
        spaceId: null,
        occupationId: null,
        conflictOccupationId: null,
        reasonCode: null,
        reasonDetail: null,
        responsibleUserId: null,
        changeKind: "alteracao",
        rowKey: "z:1",
        date: null,
        startTime: "07:00",
        endTime: "08:00",
        title: "Sem data",
        status: "nao_aplicavel",
      },
    ]);
    const result = await page(env, { changeKind: "alteracao", groups: true, limit: 5, offset: 0 });
    expect(result.rows.map((row) => row.rowKey)).toEqual(["z:1"]);
    expect(result.total).toBe(1);
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
