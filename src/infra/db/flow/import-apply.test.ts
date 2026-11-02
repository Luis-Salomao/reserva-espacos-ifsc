import { Database } from "bun:sqlite";
import { beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { createImportService, hashImportFile } from "#/application/import-apply";
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

const NOW = new Date("2026-08-01T12:00:00Z");
const clock = { now: () => NOW };

function open(): AppDb {
  const sqlite = new Database(":memory:");
  sqlite.run("PRAGMA foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "drizzle" });
  return db;
}

function lesson(id: string): Lesson {
  return {
    id,
    subjectId: "S1",
    classIds: ["C1"],
    teacherIds: ["T1"],
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

const semesterData: Omit<Semester, "id"> = {
  name: "2026.2",
  start: "2026-08-03",
  end: "2026-08-23",
  terms: [],
  blocks: [],
};

type Env = {
  db: AppDb;
  imports: ImportRepository;
  semesterId: string;
  spaceId: string;
  userId: string;
  service: ReturnType<typeof createImportService>;
};

async function setup(wrap?: (repo: ImportRepository) => ImportRepository): Promise<Env> {
  const db = open();
  const semester = await createSemesterRepository(db).create(semesterData);
  const space = await createSpaceRepository(db).create({ name: "Lab 1", capacity: null });
  const userId = "user-admin";
  await db.insert(schema.users).values({
    id: userId,
    email: "a@x.org",
    name: "Admin",
    code: null,
    roles: "admin",
    passwordHash: "x",
    active: true,
    createdAt: "t",
    updatedAt: "t",
  });
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
    semesters: createSemesterRepository(db),
    clock,
  });
  return { db, imports, semesterId: semester.id, spaceId: space.id, userId, service };
}

function prepareInput(
  env: Env,
  slots: WeeklySlot[],
  lessons: Lesson[] = [lesson("L1")],
  hash = "h1",
) {
  return {
    semesterId: env.semesterId,
    fileHash: hash,
    preview: { slots, timetable: timetable(lessons), partial: false },
    actorId: env.userId,
  };
}

async function prepareAll(env: Env, input: ReturnType<typeof prepareInput>) {
  for (let guard = 0; guard < 100; guard++) {
    const step = await env.service.prepare(input);
    if (!step.ok) throw new Error(step.message);
    if (step.value.done) return step.value;
  }
  throw new Error("prepare não terminou");
}

async function applyAll(env: Env, batchId: string) {
  for (let guard = 0; guard < 100; guard++) {
    const step = await env.service.apply(batchId);
    if (!step.ok) throw new Error(step.message);
    if (step.value.done) return step;
  }
  throw new Error("apply não terminou");
}

async function occupationCount(db: AppDb): Promise<number> {
  return (await db.select().from(schema.occupations)).length;
}

describe("hashImportFile", () => {
  test("SHA-256 em hexadecimal, estável", async () => {
    const a = await hashImportFile(new TextEncoder().encode("abc"));
    expect(a).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(await hashImportFile(new TextEncoder().encode("abc"))).toBe(a);
  });
});

describe("prepare + apply", () => {
  let env: Env;
  beforeEach(async () => {
    env = await setup();
  });

  test("fluxo completo: rascunho, aplicando, aplicado, com linhas e ocupações", async () => {
    const prepared = await env.service.prepare(
      prepareInput(
        env,
        [slot(), slot({ lessonId: "L2", classroomIds: ["R9"] })],
        [lesson("L1"), lesson("L2")],
      ),
    );
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.value.reused).toBe(false);
    expect(prepared.value.batch.status).toBe("rascunho");
    expect(prepared.value.batch.summary.counts.pendente).toBe(3);
    expect(prepared.value.batch.summary.notApplicable).toEqual({ room_unmapped: 1 });
    expect(await occupationCount(env.db)).toBe(0);

    const applied = await env.service.apply(prepared.value.batch.id);
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.value.batch.status).toBe("aplicado");
    expect(applied.value.batch.appliedAt).toBe(NOW.toISOString());
    expect(applied.value.batch.summary.counts).toMatchObject({
      aplicada: 3,
      nao_aplicavel: 1,
      pendente: 0,
    });
    const occupations = await env.db.select().from(schema.occupations);
    expect(occupations).toHaveLength(3);
    expect(occupations[0]).toMatchObject({
      spaceId: env.spaceId,
      source: "import",
      status: "ativa",
      title: "ALG — T1A",
      batchId: prepared.value.batch.id,
    });
    const report = await env.service.report(prepared.value.batch.id, {});
    expect(report.ok && report.value.rows.map((r) => r.status).sort()).toEqual([
      "aplicada",
      "aplicada",
      "aplicada",
      "nao_aplicavel",
    ]);
    const naoAplicavel = await env.service.report(prepared.value.batch.id, {
      status: "nao_aplicavel",
    });
    expect(naoAplicavel.ok && naoAplicavel.value.rows).toHaveLength(1);
    expect(naoAplicavel.ok && naoAplicavel.value.rows[0]).toMatchObject({
      reasonCode: "room_unmapped",
      occupationId: null,
    });
  });

  test("mesmo arquivo e semestre já aplicado: reconhecido, nada duplicado", async () => {
    const first = await env.service.prepare(prepareInput(env, [slot()]));
    if (!first.ok) throw new Error("prepare");
    await env.service.apply(first.value.batch.id);
    const count = await occupationCount(env.db);
    const again = await env.service.prepare(prepareInput(env, [slot()]));
    expect(again.ok && again.value.reused).toBe(true);
    expect(again.ok && again.value.batch.id).toBe(first.value.batch.id);
    expect(again.ok && again.value.batch.status).toBe("aplicado");
    const reapply = await env.service.apply(first.value.batch.id);
    expect(reapply.ok && reapply.value.batch.status).toBe("aplicado");
    expect(await occupationCount(env.db)).toBe(count);
    expect(await env.db.select().from(schema.importBatches)).toHaveLength(1);
  });

  test("hash diferente no mesmo semestre cria outro lote; conflita com o primeiro", async () => {
    const first = await env.service.prepare(prepareInput(env, [slot()]));
    if (!first.ok) throw new Error("prepare");
    await env.service.apply(first.value.batch.id);
    const second = await env.service.prepare(prepareInput(env, [slot()], [lesson("L1")], "h2"));
    expect(second.ok && second.value.reused).toBe(false);
    if (!second.ok) return;
    expect(second.value.batch.summary.counts.conflito).toBe(3);
    expect(second.value.batch.summary.counts.pendente).toBe(0);
    const applied = await env.service.apply(second.value.batch.id);
    expect(applied.ok && applied.value.batch.status).toBe("aplicado");
    expect(await occupationCount(env.db)).toBe(3);
  });

  test("rascunho refeito: nova prévia substitui as linhas do rascunho", async () => {
    const first = await env.service.prepare(prepareInput(env, [slot()]));
    if (!first.ok) throw new Error("prepare");
    const second = await env.service.prepare(prepareInput(env, [slot({ weekday: 1 })]));
    expect(second.ok && second.value.reused).toBe(false);
    if (!second.ok) return;
    expect(second.value.batch.id).not.toBe(first.value.batch.id);
    expect(await env.db.select().from(schema.importBatches)).toHaveLength(1);
    const rows = await env.db.select().from(schema.importRows);
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.batchId === second.value.batch.id)).toBe(true);
  });

  test("conflito com ocupação existente é listado e não inserido", async () => {
    await env.db.insert(schema.occupations).values({
      id: "manual-1",
      spaceId: env.spaceId,
      startsAt: "2026-08-10T09:00",
      endsAt: "2026-08-10T10:00",
      source: "manual",
      title: "Reunião",
      status: "ativa",
      createdAt: "t",
    });
    const prepared = await env.service.prepare(prepareInput(env, [slot()]));
    if (!prepared.ok) throw new Error("prepare");
    expect(prepared.value.batch.summary.counts.conflito).toBe(1);
    await env.service.apply(prepared.value.batch.id);
    expect(await occupationCount(env.db)).toBe(3);
    const conflicts = await env.service.report(prepared.value.batch.id, { status: "conflito" });
    expect(conflicts.ok && conflicts.value.rows[0]).toMatchObject({
      date: "2026-08-10",
      conflictOccupationId: "manual-1",
      reasonCode: "conflito_existente",
    });
  });

  test("ocupação cancelada não bloqueia nova importação", async () => {
    await env.db.insert(schema.occupations).values({
      id: "manual-1",
      spaceId: env.spaceId,
      startsAt: "2026-08-10T08:00",
      endsAt: "2026-08-10T09:50",
      source: "manual",
      title: "Reunião",
      status: "cancelada",
      createdAt: "t",
    });
    const prepared = await env.service.prepare(prepareInput(env, [slot()]));
    expect(prepared.ok && prepared.value.batch.summary.counts.conflito).toBe(0);
  });

  test("conflito surgido depois da prévia, durante a aplicação, vira linha de conflito", async () => {
    const prepared = await env.service.prepare(prepareInput(env, [slot()]));
    if (!prepared.ok) throw new Error("prepare");
    await env.db.insert(schema.occupations).values({
      id: "late-1",
      spaceId: env.spaceId,
      startsAt: "2026-08-17T08:30",
      endsAt: "2026-08-17T09:00",
      source: "manual",
      title: "Reserva tardia",
      status: "ativa",
      createdAt: "t",
    });
    const applied = await env.service.apply(prepared.value.batch.id);
    expect(applied.ok && applied.value.batch.status).toBe("aplicado");
    expect(await occupationCount(env.db)).toBe(3);
    const conflicts = await env.service.report(prepared.value.batch.id, { status: "conflito" });
    expect(conflicts.ok && conflicts.value.rows).toHaveLength(1);
    expect(conflicts.ok && conflicts.value.rows[0]).toMatchObject({
      date: "2026-08-17",
      conflictOccupationId: "late-1",
      occupationId: null,
    });
  });

  test("lote ou semestre inexistente", async () => {
    const missing = await env.service.apply("nao-existe");
    expect(missing.ok).toBe(false);
    expect(!missing.ok && missing.kind).toBe("not_found");
    const report = await env.service.report("nao-existe", {});
    expect(!report.ok && report.kind).toBe("not_found");
    const noSemester = await env.service.prepare({
      ...prepareInput(env, [slot()]),
      semesterId: "nao-existe",
    });
    expect(!noSemester.ok && noSemester.kind).toBe("not_found");
  });

  test("cancelamento preservado: reaplicar não recria nem reativa a ocupação cancelada", async () => {
    const prepared = await env.service.prepare(prepareInput(env, [slot()]));
    if (!prepared.ok) throw new Error("prepare");
    await env.service.apply(prepared.value.batch.id);
    const [first] = await env.db.select().from(schema.occupations);
    if (!first) throw new Error("sem ocupação");
    await env.db
      .update(schema.occupations)
      .set({ status: "cancelada" })
      .where(eq(schema.occupations.id, first.id));
    // simula lote interrompido: volta as linhas a pendente e o estado a aplicando
    await env.db.update(schema.importRows).set({ status: "pendente", occupationId: null });
    await env.db
      .update(schema.importBatches)
      .set({ status: "aplicando" })
      .where(eq(schema.importBatches.id, prepared.value.batch.id));
    const resumed = await env.service.prepare(prepareInput(env, [slot()]));
    expect(resumed.ok && resumed.value.reused).toBe(true);
    const applied = await env.service.apply(prepared.value.batch.id);
    expect(applied.ok && applied.value.batch.status).toBe("aplicado");
    const all = await env.db.select().from(schema.occupations);
    expect(all).toHaveLength(3);
    expect(all.find((o) => o.id === first.id)?.status).toBe("cancelada");
    expect(applied.ok && applied.value.batch.summary.counts.aplicada).toBe(3);
  });
});

describe("retomada após falha", () => {
  test("falha no meio: bloco vira falha, lote falhou; reaplicar completa sem duplicar", async () => {
    let calls = 0;
    let failOn = 2;
    const env = await setup((repo) => ({
      ...repo,
      applyRows: async (batchId, rows, createdAt) => {
        calls++;
        if (calls === failOn) throw new Error("falha simulada com detalhe interno");
        return repo.applyRows(batchId, rows, createdAt);
      },
    }));
    // 3 dias x 25 aulas = 75 linhas -> 3 blocos de 30
    const lessons: Lesson[] = [];
    const slots: WeeklySlot[] = [];
    for (let index = 0; index < 25; index++) {
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
    const prepared = await env.service.prepare(prepareInput(env, slots, lessons));
    if (!prepared.ok) throw new Error("prepare");
    expect(prepared.value.batch.summary.counts.pendente).toBe(75);

    const first = await env.service.apply(prepared.value.batch.id);
    expect(first.ok && first.value.batch.status).toBe("falhou");
    const counts = first.ok ? first.value.batch.summary.counts : null;
    expect(counts?.falha).toBe(30);
    expect(counts?.aplicada).toBe(30);
    expect(counts?.pendente).toBe(15);
    const failed = await env.service.report(prepared.value.batch.id, { status: "falha" });
    expect(failed.ok && failed.value.rows).toHaveLength(30);
    const reason = failed.ok ? failed.value.rows[0] : null;
    expect(reason?.reasonCode).toBe("erro_gravacao");
    expect(reason?.reasonDetail).not.toContain("simulada");
    expect(await occupationCount(env.db)).toBe(30);

    // reaplicar: retoma o que faltou
    failOn = -1;
    const again = await env.service.prepare(prepareInput(env, slots, lessons));
    expect(again.ok && again.value.reused).toBe(true);
    const second = await env.service.apply(prepared.value.batch.id);
    expect(second.ok && second.value.batch.status).toBe("aplicado");
    expect(second.ok && second.value.batch.summary.counts.aplicada).toBe(75);
    expect(second.ok && second.value.batch.summary.counts.falha).toBe(0);
    expect(await occupationCount(env.db)).toBe(75);
    expect(second.ok && second.value.batch.appliedAt).not.toBeNull();
  });
});

describe("desempenho", () => {
  test("aplica ~3000 linhas em memória em tempo razoável", async () => {
    const env = await setup();
    const maps = createMappingRepositories(env.db);
    const spaces = createSpaceRepository(env.db);
    const roomMappings = [
      { sourceRoomId: "R0", sourceShort: "R0", spaceId: env.spaceId, ignored: false },
    ];
    for (let r = 1; r < 17; r++) {
      const space = await spaces.create({ name: `Sala ${r}`, capacity: null });
      roomMappings.push({
        sourceRoomId: `R${r}`,
        sourceShort: `R${r}`,
        spaceId: space.id,
        ignored: false,
      });
    }
    await maps.rooms.saveMany(roomMappings, "t");
    const lessons: Lesson[] = [];
    const slots: WeeklySlot[] = [];
    for (let index = 0; index < 150; index++) {
      lessons.push(lesson(`L${index}`));
      const hour = String(7 + (index % 12)).padStart(2, "0");
      slots.push(
        slot({
          lessonId: `L${index}`,
          weekday: index % 5,
          start: `${hour}:00`,
          end: `${hour}:50`,
          segments: [{ period: 1, start: `${hour}:00`, end: `${hour}:50` }],
          classroomIds: [`R${Math.floor(index / 12) % 17}`],
        }),
      );
    }
    const longSemester = await createSemesterRepository(env.db).create({
      ...semesterData,
      name: "longo",
      end: "2026-12-19",
    });
    const long = { ...prepareInput(env, slots, lessons), semesterId: longSemester.id };
    const started = performance.now();
    const prepared = await prepareAll(env, long);
    const applied = await applyAll(env, prepared.batch.id);
    const elapsed = performance.now() - started;
    expect(applied.ok && applied.value.batch.status).toBe("aplicado");
    const total = await occupationCount(env.db);
    expect(total).toBeGreaterThan(400);
    expect(elapsed).toBeLessThan(20000);
    console.log(`desempenho: ${total} ocupações (prepare+apply) em ${Math.round(elapsed)} ms`);
  });
});
