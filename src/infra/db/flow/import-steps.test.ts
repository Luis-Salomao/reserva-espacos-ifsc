import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { createImportService } from "#/application/import-apply";
import type { ImportRepository } from "#/application/ports";
import type { Semester } from "#/domain/semester";
import type { AscTimetable, Lesson } from "#/domain/timetable";
import type { WeeklySlot } from "#/import-asc/slots";
import type { AppDb } from "#/infra/db/client";
import { createImportRepository } from "#/infra/db/repos/import-repository";
import { createMappingRepositories } from "#/infra/db/repos/mapping-repositories";
import { createSemesterRepository } from "#/infra/db/repos/semester-repository";
import { createSpaceRepository } from "#/infra/db/repos/space-repository";
import * as schema from "#/infra/db/schema";

const clock = { now: () => new Date("2026-08-01T12:00:00Z") };

const semesterData: Omit<Semester, "id"> = {
  name: "2026.2",
  start: "2026-08-03",
  end: "2026-08-23",
  terms: [],
  blocks: [],
};

function lesson(id: string): Lesson {
  return {
    id,
    subjectId: "S1",
    classIds: ["C1"],
    teacherIds: [],
    classroomIds: ["R1"],
    periodsPerCard: 1,
    termsDefId: null,
    weeksDefId: null,
    daysDefId: null,
  };
}

const timetable = (lessons: Lesson[]): AscTimetable => ({
  periods: [],
  days: [],
  terms: [],
  weeks: [],
  classrooms: [],
  teachers: [],
  subjects: [{ id: "S1", name: "Algoritmos", short: "ALG" }],
  classes: [{ id: "C1", name: "Turma", short: "T1A" }],
  lessons,
  cards: [],
});

function slot(over: Partial<WeeklySlot> = {}): WeeklySlot {
  return {
    lessonId: "L1",
    weekday: 0,
    start: "08:00",
    end: "09:50",
    periodFrom: 1,
    periodTo: 1,
    segments: [{ period: 1, start: "08:00", end: "09:50" }],
    classroomIds: ["R1"],
    termsMask: null,
    weeksMask: "1",
    status: "applicable",
    ...over,
  };
}

function open(foreignKeys = true): AppDb {
  const sqlite = new Database(":memory:");
  sqlite.run(`PRAGMA foreign_keys = ${foreignKeys ? "ON" : "OFF"}`);
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "drizzle" });
  return db;
}

async function setup(wrap?: (repo: ImportRepository) => ImportRepository, foreignKeys = true) {
  const db = open(foreignKeys);
  const semesters = createSemesterRepository(db);
  const semester = await semesters.create(semesterData);
  const space = await createSpaceRepository(db).create({ name: "Lab 1", capacity: null });
  for (const id of ["u", "u2"]) {
    await db.insert(schema.users).values({
      id,
      email: `${id}@x.org`,
      name: id,
      code: null,
      roles: "admin",
      passwordHash: "x",
      active: true,
      createdAt: "t",
      updatedAt: "t",
    });
  }
  const maps = createMappingRepositories(db);
  await maps.rooms.saveMany(
    [{ sourceRoomId: "R1", sourceShort: "L1", spaceId: space.id, ignored: false }],
    "t",
  );
  const base = createImportRepository(db);
  const imports = wrap ? wrap(base) : base;
  const service = createImportService({
    imports,
    rooms: maps.rooms,
    teachers: maps.teachers,
    semesters,
    clock,
  });
  return { db, imports, maps, spaceId: space.id, semesterId: semester.id, service };
}

type Env = Awaited<ReturnType<typeof setup>>;

function manySlots(count: number) {
  const lessons: Lesson[] = [];
  const slots: WeeklySlot[] = [];
  for (let index = 0; index < count; index++) {
    lessons.push(lesson(`L${index}`));
    const hour = String(6 + index).padStart(2, "0");
    slots.push(
      slot({
        lessonId: `L${index}`,
        start: `${hour}:00`,
        end: `${hour}:50`,
        segments: [{ period: 1, start: `${hour}:00`, end: `${hour}:50` }],
      }),
    );
  }
  return { slots, lessons };
}

function inputOf(env: Env, slots: WeeklySlot[], lessons: Lesson[], partial = false) {
  return {
    semesterId: env.semesterId,
    fileHash: "h1",
    preview: { slots, timetable: timetable(lessons), partial },
    actorId: "u",
  };
}

async function prepareAll(env: Env, input: ReturnType<typeof inputOf>) {
  for (let guard = 0; guard < 100; guard++) {
    const step = await env.service.prepare(input);
    if (!step.ok) throw new Error(step.message);
    if (step.value.done) return step.value;
  }
  throw new Error("prepare não terminou");
}

const occupations = async (db: AppDb) => (await db.select().from(schema.occupations)).length;

describe("preparo em etapas (perda silenciosa de linhas)", () => {
  test("falha no meio da gravação: o lote fica preparando, nunca é reutilizado nem aplicado", async () => {
    let calls = 0;
    let failOn = 2;
    const env = await setup((repo) => ({
      ...repo,
      insertRows: async (rows) => {
        calls++;
        if (calls === failOn) throw new Error("Too many API requests by single worker invocation");
        return repo.insertRows(rows);
      },
    }));
    const { slots, lessons } = manySlots(20); // 20 aulas x 3 datas = 60 linhas = 2 chamadas
    const input = inputOf(env, slots, lessons);
    await expect(env.service.prepare(input)).rejects.toThrow("Too many");
    const [stale] = await env.db.select().from(schema.importBatches);
    expect(stale?.status).toBe("preparando");
    expect(await env.db.select().from(schema.importRows)).toHaveLength(50);

    const refused = await env.service.apply(stale?.id ?? "");
    expect(!refused.ok && refused.kind).toBe("conflict");
    expect(await occupations(env.db)).toBe(0);

    failOn = -1;
    const resumed = await env.service.prepare(input);
    expect(resumed.ok && resumed.value.reused).toBe(false);
    expect(resumed.ok && resumed.value.done).toBe(true);
    expect(resumed.ok && resumed.value.batch.status).toBe("rascunho");
    expect(resumed.ok && resumed.value.batch.id).toBe(stale?.id ?? "");
    expect(await env.db.select().from(schema.importRows)).toHaveLength(60);

    const applied = await env.service.apply(stale?.id ?? "");
    expect(applied.ok && applied.value.batch.status).toBe("aplicado");
    expect(await occupations(env.db)).toBe(60);
  });

  test("outro envio venceu a criação com outro id: continua no lote dele", async () => {
    const env = await setup((repo) => ({
      ...repo,
      insertBatch: async (batch) => {
        await repo.insertBatch({ ...batch, id: "vencedor" });
        await repo.insertBatch(batch);
      },
    }));
    const { slots, lessons } = manySlots(2);
    const result = await env.service.prepare(inputOf(env, slots, lessons));
    expect(result.ok && result.value.batch.id).toBe("vencedor");
    expect(result.ok && result.value.done).toBe(true);
    const rows = await env.db.select().from(schema.importRows);
    expect(rows.every((r) => r.batchId === "vencedor")).toBe(true);
    expect(await env.db.select().from(schema.importBatches)).toHaveLength(1);
  });

  test("falha ao criar o lote propaga o erro", async () => {
    const env = await setup((repo) => ({
      ...repo,
      insertBatch: async () => {
        throw new Error("banco indisponível");
      },
    }));
    await expect(env.service.prepare(inputOf(env, [slot()], [lesson("L1")]))).rejects.toThrow(
      "banco indisponível",
    );
  });

  test("lote preparando com linhas de outro plano é refeito do zero", async () => {
    const env = await setup();
    const { slots, lessons } = manySlots(2);
    const input = inputOf(env, slots, lessons);
    await env.service.prepare(input);
    await env.db.update(schema.importBatches).set({ status: "preparando" });
    const [first] = await env.db.select().from(schema.importRows);
    await env.db
      .update(schema.importRows)
      .set({ rowKey: "o:velha" })
      .where(eq(schema.importRows.rowKey, first?.rowKey ?? ""));
    const again = await env.service.prepare(input);
    expect(again.ok && again.value.done).toBe(true);
    const rows = await env.db.select().from(schema.importRows);
    expect(rows.some((r) => r.rowKey === "o:velha")).toBe(false);
    expect(rows).toHaveLength(6);
  });

  test("apply recusa lote preparando e lote cujas linhas não batem com o resumo", async () => {
    const env = await setup();
    const { slots, lessons } = manySlots(2);
    const prepared = await env.service.prepare(inputOf(env, slots, lessons));
    if (!prepared.ok) throw new Error("prepare");
    const id = prepared.value.batch.id;
    await env.db.update(schema.importBatches).set({ status: "preparando" });
    const preparing = await env.service.apply(id);
    expect(!preparing.ok && preparing.kind).toBe("conflict");
    await env.db.update(schema.importBatches).set({ status: "rascunho" });
    const [one] = await env.db.select().from(schema.importRows);
    await env.db.delete(schema.importRows).where(eq(schema.importRows.rowKey, one?.rowKey ?? ""));
    const incomplete = await env.service.apply(id);
    expect(!incomplete.ok && incomplete.kind).toBe("conflict");
    expect(await occupations(env.db)).toBe(0);
  });

  test("prévia truncada é recusada", async () => {
    const env = await setup();
    const result = await env.service.prepare(inputOf(env, [slot()], [lesson("L1")], true));
    expect(!result.ok && result.kind).toBe("validation");
    expect(!result.ok && result.message).toContain("em parte");
    expect(await env.db.select().from(schema.importBatches)).toHaveLength(0);
  });
});

describe("etapas limitadas por chamada", () => {
  test("prepare com orçamento: devolve o progresso e termina nas chamadas seguintes", async () => {
    const env = await setup();
    const { slots, lessons } = manySlots(40); // 120 linhas = 3 chamadas de 50
    const input = inputOf(env, slots, lessons);
    const first = await env.service.prepare(input, { maxCalls: 1 });
    expect(first.ok && first.value.done).toBe(false);
    expect(first.ok && first.value.remaining).toBe(70);
    expect(first.ok && first.value.batch.status).toBe("preparando");
    const second = await env.service.prepare(input, { maxCalls: 1 });
    expect(second.ok && second.value.remaining).toBe(20);
    const third = await env.service.prepare(input, { maxCalls: 1 });
    expect(third.ok && third.value.done).toBe(true);
    expect(third.ok && third.value.remaining).toBe(0);
    expect(third.ok && third.value.batch.status).toBe("rascunho");
    expect(await env.db.select().from(schema.importRows)).toHaveLength(120);
  });

  test("apply com orçamento: fica aplicando (retomável) e só vira aplicado ao terminar", async () => {
    const env = await setup();
    const { slots, lessons } = manySlots(25); // 75 linhas = 3 blocos de 30
    const prepared = await prepareAll(env, inputOf(env, slots, lessons));
    const id = prepared.batch.id;
    const first = await env.service.apply(id, { maxChunks: 1 });
    expect(first.ok && first.value.done).toBe(false);
    expect(first.ok && first.value.remaining).toBe(45);
    expect(first.ok && first.value.batch.status).toBe("aplicando");
    expect(first.ok && first.value.batch.summary.counts.aplicada).toBe(30);
    expect(await occupations(env.db)).toBe(30);
    const second = await env.service.apply(id, { maxChunks: 1 });
    expect(second.ok && second.value.remaining).toBe(15);
    expect(second.ok && second.value.batch.status).toBe("aplicando");
    const third = await env.service.apply(id, { maxChunks: 1 });
    expect(third.ok && third.value.done).toBe(true);
    expect(third.ok && third.value.batch.status).toBe("aplicado");
    expect(await occupations(env.db)).toBe(75);
    const after = await env.service.apply(id, { maxChunks: 1 });
    expect(after.ok && after.value.done).toBe(true);
    expect(after.ok && after.value.remaining).toBe(0);
  });

  test("pendingRows aplica o limite na consulta", async () => {
    const env = await setup();
    const { slots, lessons } = manySlots(10);
    const prepared = await prepareAll(env, inputOf(env, slots, lessons));
    expect(await env.imports.pendingRows(prepared.batch.id, 7, "insercoes")).toHaveLength(7);
    expect(await env.imports.pendingRows(prepared.batch.id, 100, "insercoes")).toHaveLength(30);
  });
});

describe("retomada: bloco gravado, confirmação perdida", () => {
  test("erro reportado depois do commit: reaplicar conta tudo como aplicado, sem duplicar", async () => {
    let calls = 0;
    const env = await setup((repo) => ({
      ...repo,
      applyRows: async (batchId, rows, createdAt) => {
        calls++;
        await repo.applyRows(batchId, rows, createdAt);
        if (calls === 1) throw new Error("confirmação perdida");
      },
    }));
    const { slots, lessons } = manySlots(25);
    const prepared = await prepareAll(env, inputOf(env, slots, lessons));
    const first = await env.service.apply(prepared.batch.id);
    expect(first.ok && first.value.batch.status).toBe("falhou");
    expect(await occupations(env.db)).toBe(30);
    const second = await env.service.apply(prepared.batch.id);
    expect(second.ok && second.value.batch.status).toBe("aplicado");
    expect(second.ok && second.value.batch.summary.counts).toMatchObject({
      aplicada: 75,
      conflito: 0,
      falha: 0,
    });
    expect(await occupations(env.db)).toBe(75);
  });

  test("ocupações existem mas as linhas voltaram a falha: reaplicar as marca aplicadas", async () => {
    const env = await setup();
    const { slots, lessons } = manySlots(5);
    const prepared = await prepareAll(env, inputOf(env, slots, lessons));
    await env.service.apply(prepared.batch.id);
    await env.db.update(schema.importRows).set({ status: "falha", occupationId: null });
    await env.db.update(schema.importBatches).set({ status: "falhou" });
    const again = await env.service.apply(prepared.batch.id);
    expect(again.ok && again.value.batch.status).toBe("aplicado");
    expect(again.ok && again.value.batch.summary.counts).toMatchObject({
      aplicada: 15,
      conflito: 0,
      falha: 0,
    });
    expect(await occupations(env.db)).toBe(15);
  });
});

describe("linhas guardam o dia da semana", () => {
  test("ocorrências pela data e não aplicáveis pelo slot", async () => {
    const env = await setup();
    const input = inputOf(
      env,
      [slot({ weekday: 2 }), slot({ weekday: 4, status: "no_room", classroomIds: [] })],
      [lesson("L1")],
    );
    await prepareAll(env, input);
    const rows = await env.db.select().from(schema.importRows);
    expect(rows.filter((r) => r.status === "pendente").every((r) => r.weekday === 2)).toBe(true);
    expect(rows.find((r) => r.status === "nao_aplicavel")?.weekday).toBe(4);
  });
});

describe("repositório", () => {
  test("insertRows repetido é inofensivo; deleteDraft não toca lote aplicado", async () => {
    const env = await setup();
    const { slots, lessons } = manySlots(3);
    const prepared = await prepareAll(env, inputOf(env, slots, lessons));
    const rows = await env.imports.listRows(prepared.batch.id, { limit: 100, offset: 0 });
    await env.imports.insertRows(rows);
    await env.imports.insertRows([]);
    expect(await env.db.select().from(schema.importRows)).toHaveLength(9);
    expect(await env.imports.listRows(prepared.batch.id, { limit: 4, offset: 7 })).toHaveLength(2);
    await env.service.apply(prepared.batch.id);
    await env.imports.deleteDraft(prepared.batch.id);
    expect((await env.imports.findBatch(prepared.batch.id))?.status).toBe("aplicado");
    expect((await env.imports.countRows(prepared.batch.id)).aplicada).toBe(9);
    await env.imports.markFailed(prepared.batch.id, [], "x", "y");
    await env.imports.applyRows(prepared.batch.id, [], "t");
    expect(await env.imports.findBatchByHash("outro", "h1")).toBeNull();
  });

  test("ocupação ativa sobreposta nunca é inserida, mesmo direto no repositório", async () => {
    const env = await setup();
    const prepared = await prepareAll(env, inputOf(env, [slot()], [lesson("L1")]));
    const [space] = await env.db.select().from(schema.spaces);
    await env.db.insert(schema.occupations).values({
      id: "bloqueio",
      spaceId: space?.id ?? "",
      startsAt: "2026-08-03T07:00",
      endsAt: "2026-08-03T12:00",
      source: "manual",
      title: "Bloqueio",
      status: "ativa",
      createdAt: "t",
    });
    const rows = await env.imports.pendingRows(prepared.batch.id, 100, "insercoes");
    await env.imports.applyRows(prepared.batch.id, rows, "t");
    const inserted = await env.db.select().from(schema.occupations);
    expect(inserted.map((o) => o.startsAt).sort()).toEqual([
      "2026-08-03T07:00",
      "2026-08-10T08:00",
      "2026-08-17T08:00",
    ]);
    const [conflict] = await env.imports.listRows(prepared.batch.id, {
      status: "conflito",
      limit: 5,
      offset: 0,
    });
    expect(conflict?.conflictOccupationId).toBe("bloqueio");
  });

  test("vínculos: grava mais de 50 itens em blocos", async () => {
    const env = await setup();
    const maps = createMappingRepositories(env.db);
    await maps.rooms.saveMany(
      Array.from({ length: 120 }, (_, i) => ({
        sourceRoomId: `X${i}`,
        sourceShort: `x${i}`,
        spaceId: null,
        ignored: true,
      })),
      "t",
    );
    expect((await maps.rooms.list()).length).toBe(121);
    await maps.teachers.saveMany(
      Array.from({ length: 60 }, (_, i) => ({
        sourceTeacherId: `T${i}`,
        sourceShort: `t${i}`,
        userId: null,
      })),
      "t",
    );
    expect((await maps.teachers.list()).length).toBe(60);
  });
});

describe("transições com comparar-e-trocar (corrida entre prepare e apply)", () => {
  test("prepare lento não devolve lote aplicando a rascunho", async () => {
    const env = await setup();
    const { slots, lessons } = manySlots(3);
    const input = inputOf(env, slots, lessons);
    const done = await prepareAll(env, input);
    const first = await env.service.apply(done.batch.id, { maxChunks: 1 });
    expect(first.ok && first.value.batch.status).toBe("aplicado");
    // simula o prepare lento: lote já aplicando, ele tenta fechar o preparo
    await env.db
      .update(schema.importBatches)
      .set({ status: "aplicando" })
      .where(eq(schema.importBatches.id, done.batch.id));
    const ok = await env.imports.transition(done.batch.id, ["preparando"], { status: "rascunho" });
    expect(ok).toBe(false);
    expect((await env.imports.findBatch(done.batch.id))?.status).toBe("aplicando");
  });

  test("fechar o preparo de um lote que já saiu de preparando vira conflito tipado", async () => {
    let swapped = false;
    const env = await setup((repo) => ({
      ...repo,
      countRows: async (id) => {
        const counts = await repo.countRows(id);
        if (!swapped) {
          swapped = true;
          await repo.transition(id, ["preparando"], { status: "aplicando" });
        }
        return counts;
      },
    }));
    const { slots, lessons } = manySlots(2);
    const result = await env.service.prepare(inputOf(env, slots, lessons));
    expect(!result.ok && result.kind).toBe("conflict");
    expect((await env.db.select().from(schema.importBatches))[0]?.status).toBe("aplicando");
  });

  test("apply concorrente com a refação do rascunho não devolve aplicado para lote apagado", async () => {
    let raced = true;
    const env = await setup((repo) => ({
      ...repo,
      countRows: async (id) => {
        const counts = await repo.countRows(id);
        if (!raced) {
          raced = true;
          await repo.deleteDraft(id);
        }
        return counts;
      },
    }));
    const { slots, lessons } = manySlots(2);
    const prepared = await prepareAll(env, inputOf(env, slots, lessons));
    raced = false;
    const result = await env.service.apply(prepared.batch.id);
    expect(!result.ok && result.kind).toBe("conflict");
    expect(await occupations(env.db)).toBe(0);
  });

  test("deleteDraft não depende de chaves estrangeiras: linhas de lote aplicando sobrevivem", async () => {
    const env = await setup(undefined, false);
    const { slots, lessons } = manySlots(25);
    const prepared = await prepareAll(env, inputOf(env, slots, lessons));
    await env.service.apply(prepared.batch.id, { maxChunks: 1 });
    expect((await env.imports.findBatch(prepared.batch.id))?.status).toBe("aplicando");
    const before = (await env.db.select().from(schema.importRows)).length;
    await env.imports.deleteDraft(prepared.batch.id);
    expect((await env.db.select().from(schema.importRows)).length).toBe(before);
    expect((await env.imports.findBatch(prepared.batch.id))?.status).toBe("aplicando");
  });

  test("apply só sai de aplicando para aplicado ou falhou uma vez", async () => {
    const env = await setup();
    const { slots, lessons } = manySlots(2);
    const prepared = await prepareAll(env, inputOf(env, slots, lessons));
    expect(
      await env.imports.transition(prepared.batch.id, ["aplicando"], { status: "aplicado" }),
    ).toBe(false);
    expect(await env.imports.transition("nao-existe", ["rascunho"], { status: "aplicando" })).toBe(
      false,
    );
  });
});

describe("impressão digital do plano (preparando refeito quando o conteúdo muda)", () => {
  const withTeacher = (lessons: Lesson[]) => lessons.map((l) => ({ ...l, teacherIds: ["T1"] }));

  test("vínculo de docente muda no meio do preparo: refaz com o responsável novo", async () => {
    const env = await setup();
    await env.maps.teachers.saveMany(
      [{ sourceTeacherId: "T1", sourceShort: "T1", userId: "u" }],
      "t",
    );
    const { slots, lessons } = manySlots(40);
    const input = inputOf(env, slots, withTeacher(lessons));
    const first = await env.service.prepare(input, { maxCalls: 1 });
    expect(first.ok && first.value.done).toBe(false);
    await env.maps.teachers.saveMany(
      [{ sourceTeacherId: "T1", sourceShort: "T1", userId: "u2" }],
      "t",
    );
    const done = await prepareAll(env, input);
    const rows = await env.db.select().from(schema.importRows);
    expect(
      rows.filter((r) => r.status === "pendente").every((r) => r.responsibleUserId === "u2"),
    ).toBe(true);
    expect(rows).toHaveLength(120);
    expect(done.batch.status).toBe("rascunho");
  });

  test("conflito aparece no meio do preparo: a linha vira conflito ao refazer", async () => {
    const env = await setup();
    const { slots, lessons } = manySlots(40);
    const input = inputOf(env, slots, lessons);
    await env.service.prepare(input, { maxCalls: 1 });
    await env.db.insert(schema.occupations).values({
      id: "novo",
      spaceId: env.spaceId,
      startsAt: "2026-08-03T06:30",
      endsAt: "2026-08-03T07:30",
      source: "manual",
      title: "Reserva",
      status: "ativa",
      createdAt: "t",
    });
    await prepareAll(env, input);
    const rows = await env.db.select().from(schema.importRows);
    expect(rows.filter((r) => r.status === "conflito").map((r) => r.conflictOccupationId)).toEqual([
      "novo",
      "novo",
    ]);
    expect(rows).toHaveLength(120);
  });

  test("mesmo plano: retoma o mesmo lote sem refazer", async () => {
    const env = await setup();
    const { slots, lessons } = manySlots(40);
    const input = inputOf(env, slots, lessons);
    const first = await env.service.prepare(input, { maxCalls: 1 });
    const second = await env.service.prepare(input, { maxCalls: 1 });
    expect(second.ok && first.ok && second.value.batch.id).toBe(
      first.ok ? first.value.batch.id : "",
    );
    expect(second.ok && second.value.remaining).toBe(20);
  });
});
