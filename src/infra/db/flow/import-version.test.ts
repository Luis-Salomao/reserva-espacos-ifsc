import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { createImportService } from "#/application/import-apply";
import type { ImportRepository } from "#/application/ports";
import { EMPTY_COUNTS, type ImportRow } from "#/domain/import-batch";
import type { Semester } from "#/domain/semester";
import type { AscTimetable, Lesson } from "#/domain/timetable";
import type { WeeklySlot } from "#/import-asc/slots";
import type { AppDb } from "#/infra/db/client";
import { createImportRepository } from "#/infra/db/repos/import-repository";
import { createMappingRepositories } from "#/infra/db/repos/mapping-repositories";
import { createSemesterRepository } from "#/infra/db/repos/semester-repository";
import { createSpaceRepository } from "#/infra/db/repos/space-repository";
import * as schema from "#/infra/db/schema";

// Segundas-feiras do semestre: 3, 10 e 17 de agosto de 2026 (3 ocorrências por aula semanal).
const semesterData: Omit<Semester, "id"> = {
  name: "2026.2",
  start: "2026-08-03",
  end: "2026-08-23",
  terms: [],
  blocks: [],
};

function lesson(id: string, teacherIds: string[] = ["T1"], subjectId = "S1"): Lesson {
  return {
    id,
    subjectId,
    classIds: ["C1"],
    teacherIds,
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
  subjects: [
    { id: "S1", name: "Algoritmos", short: "ALG" },
    { id: "S2", name: "Banco de Dados", short: "BD" },
    { id: "S3", name: "Redes", short: "RED" },
  ],
  classes: [{ id: "C1", name: "Turma", short: "T1A" }],
  lessons,
  cards: [],
});

/** Aula numa sala às `hour`:00-`hour`:50 na segunda-feira. */
function at(lessonId: string, room: string, hour = 8, over: Partial<WeeklySlot> = {}): WeeklySlot {
  const start = `${String(hour).padStart(2, "0")}:00`;
  const end = `${String(hour).padStart(2, "0")}:50`;
  return {
    lessonId,
    weekday: 0,
    start,
    end,
    periodFrom: 1,
    periodTo: 1,
    segments: [{ period: 1, start, end }],
    classroomIds: [room],
    termsMask: null,
    weeksMask: "1",
    status: "applicable",
    ...over,
  };
}

type Version = { slots: WeeklySlot[]; lessons: Lesson[]; hash: string };

const version = (hash: string, slots: WeeklySlot[], lessons?: Lesson[]): Version => ({
  hash,
  slots,
  lessons:
    lessons ??
    [...new Set(slots.map((s) => s.lessonId))].map((id) =>
      lesson(id, ["T1"], id.startsWith("B") ? "S2" : id.startsWith("C") ? "S3" : "S1"),
    ),
});

type Env = {
  db: AppDb;
  semesterId: string;
  spaces: Record<"R1" | "R2" | "R3" | "R4", string>;
  userId: string;
  clock: { time: number };
  service: ReturnType<typeof createImportService>;
  imports: ImportRepository;
};

function open(): AppDb {
  const sqlite = new Database(":memory:");
  sqlite.run("PRAGMA foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "drizzle" });
  return db;
}

async function setup(wrap?: (repo: ImportRepository) => ImportRepository): Promise<Env> {
  const db = open();
  const semester = await createSemesterRepository(db).create(semesterData);
  const spaceRepo = createSpaceRepository(db);
  const spaces = {
    R1: (await spaceRepo.create({ name: "Lab 1", capacity: null })).id,
    R2: (await spaceRepo.create({ name: "Lab 2", capacity: null })).id,
    R3: (await spaceRepo.create({ name: "Lab 3", capacity: null })).id,
    R4: (await spaceRepo.create({ name: "Lab 4", capacity: null })).id,
  };
  const userRow = (id: string) => ({
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
  for (const id of ["user-admin", "user-t1", "user-t2"]) {
    await db.insert(schema.users).values(userRow(id));
  }
  const maps = createMappingRepositories(db);
  await maps.rooms.saveMany(
    (["R1", "R2", "R3", "R4"] as const).map((room) => ({
      sourceRoomId: room,
      sourceShort: room,
      spaceId: spaces[room],
      ignored: false,
    })),
    "t",
  );
  await maps.teachers.saveMany(
    [
      { sourceTeacherId: "T1", sourceShort: "P1", userId: "user-t1" },
      { sourceTeacherId: "T2", sourceShort: "P2", userId: "user-t2" },
    ],
    "t",
  );
  const base = createImportRepository(db);
  const imports = wrap ? wrap(base) : base;
  const clock = { time: Date.parse("2026-08-01T12:00:00Z") };
  const service = createImportService({
    imports,
    rooms: maps.rooms,
    teachers: maps.teachers,
    semesters: createSemesterRepository(db),
    clock: { now: () => new Date(clock.time) },
  });
  return { db, semesterId: semester.id, spaces, userId: "user-admin", clock, service, imports };
}

const input = (env: Env, v: Version) => ({
  semesterId: env.semesterId,
  fileHash: v.hash,
  preview: { slots: v.slots, timetable: timetable(v.lessons), partial: false },
  actorId: env.userId,
});

async function prepareAll(env: Env, v: Version) {
  for (let guard = 0; guard < 100; guard++) {
    const step = await env.service.prepare(input(env, v));
    if (!step.ok) throw new Error(step.message);
    if (step.value.done) return step.value;
  }
  throw new Error("prepare não terminou");
}

async function applyAll(env: Env, batchId: string) {
  for (let guard = 0; guard < 100; guard++) {
    env.clock.time += 1000;
    const step = await env.service.apply(batchId);
    if (!step.ok) throw new Error(step.message);
    if (step.value.done) return step.value;
  }
  throw new Error("apply não terminou");
}

/** Prepara e aplica uma versão inteira; devolve o lote aplicado. */
async function publish(env: Env, v: Version) {
  const prepared = await prepareAll(env, v);
  const applied = await applyAll(env, prepared.batch.id);
  return applied.batch;
}

async function rowsOf(env: Env, batchId: string): Promise<ImportRow[]> {
  return env.imports.listRows(batchId, { limit: 5000, offset: 0 });
}

function tally(rows: ImportRow[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const key = `${row.status}/${row.changeKind ?? "-"}`;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

async function occupationsOf(env: Env, batchId?: string) {
  const all = await env.db.select().from(schema.occupations);
  return batchId === undefined ? all : all.filter((o) => o.batchId === batchId);
}

const manualBooking = (
  spaceId: string,
  startsAt = "2026-08-10T08:30",
  endsAt = "2026-08-10T09:00",
) => ({
  id: "manual-1",
  spaceId,
  startsAt,
  endsAt,
  source: "manual" as const,
  title: "Reunião",
  status: "ativa" as const,
  createdAt: "t",
});

/** Doze aulas distintas (um horário por aula) na sala indicada: 36 ocorrências. */
function twelve(room: string, hash: string, teacher = "T1"): Version {
  const lessons: Lesson[] = [];
  const slots: WeeklySlot[] = [];
  for (let index = 0; index < 12; index++) {
    lessons.push(lesson(`L${index}`, [teacher]));
    slots.push(at(`L${index}`, room, 6 + index));
  }
  return { slots, lessons, hash };
}

describe("nova versão: classificação e aplicação", () => {
  test("versão igual com outro hash: tudo inalterada, nada a gravar, aplica sem tocar nas ocupações", async () => {
    const env = await setup();
    const first = await publish(env, version("h1", [at("L1", "R1")]));
    const before = await occupationsOf(env);
    const prepared = await prepareAll(env, version("h2", [at("L1", "R1")]));
    expect(prepared.reused).toBe(false);
    expect(prepared.batch.status).toBe("rascunho");
    expect(prepared.batch.supersedesBatchId).toBe(first.id);
    expect(prepared.batch.summary.counts.inalterada).toBe(3);
    expect(prepared.batch.summary.counts.pendente).toBe(0);
    expect(prepared.batch.summary.version).toEqual({
      supersedesBatchId: first.id,
      inclusoes: 0,
      alteracoes: 0,
      bloqueadas: 0,
      remocoes: 0,
      responsaveis: 0,
      inalteradas: 3,
      mantidasCanceladas: 0,
      affectedUserIds: [],
    });
    const applied = await applyAll(env, prepared.batch.id);
    expect(applied.batch.status).toBe("aplicado");
    expect(await occupationsOf(env)).toEqual(before);
    expect(tally(await rowsOf(env, prepared.batch.id))).toEqual({ "inalterada/inalterada": 3 });
  });

  test("Review Focus 1: cancelamento anterior continua cancelado depois de uma versão igual", async () => {
    const env = await setup();
    await publish(env, version("h1", [at("L1", "R1")]));
    const [second] = (await occupationsOf(env)).filter((o) => o.startsAt.startsWith("2026-08-10"));
    if (!second) throw new Error("sem ocupação");
    await env.db
      .update(schema.occupations)
      .set({ status: "cancelada" })
      .where(eq(schema.occupations.id, second.id));
    const prepared = await prepareAll(env, version("h2", [at("L1", "R1")]));
    expect(prepared.batch.summary.counts).toMatchObject({
      mantida_cancelada: 1,
      inalterada: 2,
      pendente: 0,
    });
    expect(prepared.batch.summary.version?.mantidasCanceladas).toBe(1);
    await applyAll(env, prepared.batch.id);
    const all = await occupationsOf(env);
    expect(all).toHaveLength(3);
    expect(all.find((o) => o.id === second.id)?.status).toBe("cancelada");
    expect(all.find((o) => o.id === second.id)?.cancelReason).toBeNull();
    expect(all.filter((o) => o.status === "ativa")).toHaveLength(2);
  });

  test("Review Focus 2: aula movida de sala libera a antiga e ocupa a nova, sem conflito consigo mesma", async () => {
    const env = await setup();
    const first = await publish(env, version("h1", [at("L1", "R1")]));
    const prepared = await prepareAll(env, version("h2", [at("L1", "R2")]));
    expect(tally(await rowsOf(env, prepared.batch.id))).toEqual({
      "cancelar/alteracao": 3,
      "pendente/alteracao": 3,
    });
    expect(prepared.batch.summary.counts.conflito).toBe(0);
    expect(prepared.batch.summary.version).toMatchObject({ alteracoes: 3, inclusoes: 0 });
    expect(prepared.batch.summary.version?.affectedUserIds).toEqual(["user-t1"]);
    // nada mudou ainda
    expect((await occupationsOf(env)).every((o) => o.status === "ativa")).toBe(true);
    const applied = await applyAll(env, prepared.batch.id);
    expect(applied.batch.status).toBe("aplicado");
    const old = await occupationsOf(env, first.id);
    expect(old.map((o) => [o.spaceId, o.status, o.cancelReason])).toEqual(
      Array(3).fill([env.spaces.R1, "cancelada", "nova_versao"]),
    );
    expect(old.every((o) => o.cancelledAt?.startsWith("2026-08-01T12:00"))).toBe(true);
    const fresh = await occupationsOf(env, prepared.batch.id);
    expect(fresh.map((o) => [o.spaceId, o.status, o.source])).toEqual(
      Array(3).fill([env.spaces.R2, "ativa", "import"]),
    );
    expect(tally(await rowsOf(env, prepared.batch.id))).toEqual({
      "cancelada_versao/alteracao": 3,
      "aplicada/alteracao": 3,
    });
  });

  test("mudança de horário na mesma sala, sobreposta à antiga, não conflita com a que será cancelada", async () => {
    const env = await setup();
    await publish(env, version("h1", [at("L1", "R1", 8)]));
    const shifted = at("L1", "R1", 8, {
      start: "09:00",
      end: "10:50",
      segments: [{ period: 1, start: "09:00", end: "10:50" }],
    });
    const prepared = await prepareAll(env, version("h2", [shifted]));
    expect(prepared.batch.summary.counts).toMatchObject({ cancelar: 3, pendente: 3, conflito: 0 });
    await applyAll(env, prepared.batch.id);
    const active = (await occupationsOf(env)).filter((o) => o.status === "ativa");
    expect(active).toHaveLength(3);
    expect(active.every((o) => o.startsAt.endsWith("T09:00") && o.endsAt.endsWith("T10:50"))).toBe(
      true,
    );
  });

  test("remoção, inclusão e não aplicável convivem; o resto fica inalterado", async () => {
    const env = await setup();
    const first = await publish(env, version("h1", [at("L1", "R1", 8), at("B2", "R1", 10)]));
    const second = version(
      "h2",
      [at("L1", "R1", 8), at("B3", "R1", 12), at("L9", "R9", 14)],
      [lesson("L1"), lesson("B3", ["T1"], "S3"), lesson("L9")],
    );
    const prepared = await prepareAll(env, second);
    expect(tally(await rowsOf(env, prepared.batch.id))).toEqual({
      "inalterada/inalterada": 3,
      "cancelar/remocao": 3,
      "pendente/inclusao": 3,
      "nao_aplicavel/-": 1,
    });
    expect(prepared.batch.summary.version).toMatchObject({
      remocoes: 3,
      inclusoes: 3,
      inalteradas: 3,
      affectedUserIds: ["user-t1"],
    });
    await applyAll(env, prepared.batch.id);
    const all = await occupationsOf(env);
    const l2 = all.filter((o) => o.lessonId === "B2");
    expect(l2).toHaveLength(3);
    expect(l2.every((o) => o.status === "cancelada" && o.cancelReason === "nova_versao")).toBe(
      true,
    );
    expect(all.filter((o) => o.lessonId === "B3" && o.status === "ativa")).toHaveLength(3);
    const kept = all.filter((o) => o.lessonId === "L1");
    expect(kept.every((o) => o.status === "ativa" && o.batchId === first.id)).toBe(true);
  });

  test("troca só de responsável atualiza a mesma ocupação, sem cancelar", async () => {
    const env = await setup();
    const first = await publish(env, version("h1", [at("L1", "R1")]));
    const before = await occupationsOf(env);
    const prepared = await prepareAll(env, version("h2", [at("L1", "R1")], [lesson("L1", ["T2"])]));
    expect(tally(await rowsOf(env, prepared.batch.id))).toEqual({ "responsavel/responsavel": 3 });
    expect(prepared.batch.summary.version?.responsaveis).toBe(3);
    expect(prepared.batch.summary.version?.affectedUserIds).toEqual(["user-t1", "user-t2"]);
    await applyAll(env, prepared.batch.id);
    const after = await occupationsOf(env);
    expect(after.map((o) => o.id).sort()).toEqual(before.map((o) => o.id).sort());
    expect(after.every((o) => o.status === "ativa" && o.responsibleUserId === "user-t2")).toBe(
      true,
    );
    expect(after.every((o) => o.batchId === first.id && o.cancelReason === null)).toBe(true);
    expect(tally(await rowsOf(env, prepared.batch.id))).toEqual({
      "responsavel_atualizado/responsavel": 3,
    });
  });

  test("Review Focus 3: reserva avulsa no horário de uma inclusão vira conflito e fica intacta", async () => {
    const env = await setup();
    await publish(env, version("h1", [at("L1", "R1")]));
    await env.db.insert(schema.occupations).values(manualBooking(env.spaces.R2));
    const manualBefore = (await occupationsOf(env)).find((o) => o.id === "manual-1");
    const prepared = await prepareAll(env, version("h2", [at("L1", "R1"), at("B3", "R2", 8)]));
    expect(tally(await rowsOf(env, prepared.batch.id))).toEqual({
      "inalterada/inalterada": 3,
      "pendente/inclusao": 2,
      "conflito/inclusao": 1,
    });
    const conflict = (await rowsOf(env, prepared.batch.id)).find((r) => r.status === "conflito");
    expect(conflict).toMatchObject({
      date: "2026-08-10",
      conflictOccupationId: "manual-1",
      reasonCode: "conflito_existente",
    });
    await applyAll(env, prepared.batch.id);
    expect((await occupationsOf(env)).find((o) => o.id === "manual-1")).toEqual(manualBefore);
    const l3 = (await occupationsOf(env)).filter((o) => o.lessonId === "B3");
    expect(l3.map((o) => o.startsAt.slice(0, 10)).sort()).toEqual(["2026-08-03", "2026-08-17"]);
  });

  test("aula movida para uma sala com reserva avulsa: a data em conflito mantém a versão anterior (alteração bloqueada)", async () => {
    const env = await setup();
    await publish(env, version("h1", [at("L1", "R1")]));
    await env.db.insert(schema.occupations).values(manualBooking(env.spaces.R2));
    const manualBefore = (await occupationsOf(env)).find((o) => o.id === "manual-1");
    const prepared = await prepareAll(env, version("h2", [at("L1", "R2")]));
    expect(tally(await rowsOf(env, prepared.batch.id))).toEqual({
      "cancelar/alteracao": 2,
      "pendente/alteracao": 2,
      "conflito/alteracao": 1,
      "alteracao_bloqueada/alteracao": 1,
    });
    const blocked = (await rowsOf(env, prepared.batch.id)).find(
      (r) => r.status === "alteracao_bloqueada",
    );
    expect(blocked).toMatchObject({ date: "2026-08-10", reasonCode: "alteracao_bloqueada" });
    expect(prepared.batch.summary.counts.alteracao_bloqueada).toBe(1);
    await applyAll(env, prepared.batch.id);
    const all = await occupationsOf(env);
    expect(all.find((o) => o.id === "manual-1")).toEqual(manualBefore);
    expect(all.filter((o) => o.batchId === prepared.batch.id)).toHaveLength(2);
    const held = all.find((o) => o.id === blocked?.occupationId);
    expect(held).toMatchObject({ status: "ativa", cancelReason: null, spaceId: env.spaces.R1 });
  });

  test("grupo bloqueado também segura as outras inserções do grupo", async () => {
    const env = await setup();
    await publish(env, version("h1", [at("L1", "R1")]));
    await env.db.insert(schema.occupations).values(manualBooking(env.spaces.R2));
    const prepared = await prepareAll(
      env,
      version("h2", [at("L1", "R2"), at("L1b", "R3")], [lesson("L1"), lesson("L1b")]),
    );
    const onTen = (await rowsOf(env, prepared.batch.id)).filter((r) => r.date === "2026-08-10");
    expect(onTen.map((r) => r.status).sort()).toEqual([
      "alteracao_bloqueada",
      "alteracao_bloqueada",
      "conflito",
    ]);
    await applyAll(env, prepared.batch.id);
    const active = (await occupationsOf(env)).filter(
      (o) => o.status === "ativa" && o.startsAt.startsWith("2026-08-10") && o.source === "import",
    );
    expect(active.map((o) => o.batchId)).toEqual([expect.not.stringContaining(prepared.batch.id)]);
  });

  test("cancelada antes cuja sala mudou: a nova ocorrência não é inserida e fica mantida cancelada", async () => {
    const env = await setup();
    await publish(env, version("h1", [at("L1", "R1")]));
    const [second] = (await occupationsOf(env)).filter((o) => o.startsAt.startsWith("2026-08-10"));
    if (!second) throw new Error("sem ocupação");
    await env.db
      .update(schema.occupations)
      .set({ status: "cancelada" })
      .where(eq(schema.occupations.id, second.id));
    const prepared = await prepareAll(env, version("h2", [at("L1", "R2")]));
    expect(tally(await rowsOf(env, prepared.batch.id))).toEqual({
      "cancelar/alteracao": 2,
      "pendente/alteracao": 2,
      "mantida_cancelada/mantida_cancelada": 1,
    });
    const kept = (await rowsOf(env, prepared.batch.id)).find((r) => r.occupationId === second.id);
    expect(kept).toMatchObject({
      reasonCode: "cancelada_alterada",
      reasonDetail: "Cancelada antes; sala ou horário mudou na nova versão.",
    });
    await applyAll(env, prepared.batch.id);
    const all = await occupationsOf(env);
    expect(all.find((o) => o.id === second.id)?.status).toBe("cancelada");
    expect(all.filter((o) => o.batchId === prepared.batch.id)).toHaveLength(2);
    expect(all.some((o) => o.startsAt.startsWith("2026-08-10") && o.status === "ativa")).toBe(
      false,
    );
  });

  test("reserva avulsa criada depois do preparo: conflito concorrente e a avulsa fica intacta", async () => {
    const env = await setup();
    await publish(env, version("h1", [at("L1", "R1")]));
    const prepared = await prepareAll(env, version("h2", [at("L1", "R1"), at("B3", "R2", 8)]));
    await env.db.insert(schema.occupations).values(manualBooking(env.spaces.R2));
    await applyAll(env, prepared.batch.id);
    const rows = await rowsOf(env, prepared.batch.id);
    expect(rows.find((r) => r.status === "conflito")).toMatchObject({
      reasonCode: "conflito_concorrente",
      conflictOccupationId: "manual-1",
    });
    expect((await occupationsOf(env)).find((o) => o.id === "manual-1")?.status).toBe("ativa");
  });

  test("troca de salas entre duas aulas no mesmo horário: cancela tudo antes de inserir, sem conflito", async () => {
    const env = await setup();
    await publish(env, version("h1", [at("L1", "R1"), at("B2", "R2")]));
    const prepared = await prepareAll(env, version("h2", [at("L1", "R2"), at("B2", "R1")]));
    expect(prepared.batch.summary.counts).toMatchObject({ cancelar: 6, pendente: 6, conflito: 0 });
    await applyAll(env, prepared.batch.id);
    const active = (await occupationsOf(env)).filter((o) => o.status === "ativa");
    expect(active).toHaveLength(6);
    expect(active.every((o) => o.batchId === prepared.batch.id)).toBe(true);
  });

  test("aula movida para a sala onde outra aula do arquivo já está: conflito no arquivo, a anterior é mantida", async () => {
    const env = await setup();
    await publish(env, version("h1", [at("L1", "R1"), at("B2", "R2")]));
    const prepared = await prepareAll(env, version("h2", [at("L1", "R2"), at("B2", "R2")]));
    expect(tally(await rowsOf(env, prepared.batch.id))).toEqual({
      "inalterada/inalterada": 3,
      "alteracao_bloqueada/alteracao": 3,
      "conflito_interno/alteracao": 3,
    });
    await applyAll(env, prepared.batch.id);
    expect((await occupationsOf(env, prepared.batch.id)).length).toBe(0);
    expect((await occupationsOf(env)).filter((o) => o.status === "ativa")).toHaveLength(6);
  });

  test("inclusão que cairia sobre ocupação vigente que permanece ativa vira conflito com ela", async () => {
    const env = await setup();
    await publish(env, version("h1", [at("L1", "R1")]));
    const [kept] = (await occupationsOf(env)).filter((o) => o.startsAt.startsWith("2026-08-10"));
    if (!kept) throw new Error("sem ocupação");
    // reserva avulsa gravada sem passar pela guarda: a aula de 10/08 conflita com ela no arquivo novo
    await env.db
      .insert(schema.occupations)
      .values(manualBooking(env.spaces.R1, "2026-08-10T08:10", "2026-08-10T08:20"));
    const overlapping = at("B3", "R1", 8, {
      start: "08:30",
      end: "09:20",
      segments: [{ period: 1, start: "08:30", end: "09:20" }],
    });
    const prepared = await prepareAll(env, version("h2", [at("L1", "R1"), overlapping]));
    const rows = await rowsOf(env, prepared.batch.id);
    expect(tally(rows)).toEqual({
      "inalterada/inalterada": 3,
      "conflito_interno/inclusao": 2,
      "conflito/inclusao": 1,
    });
    expect(rows.find((r) => r.status === "conflito")).toMatchObject({
      date: "2026-08-10",
      conflictOccupationId: kept.id,
    });
    await applyAll(env, prepared.batch.id);
    expect(await occupationsOf(env, prepared.batch.id)).toHaveLength(0);
  });

  test("Review Focus 5: dois títulos iguais na mesma data comparam o multiconjunto", async () => {
    const lessons = [lesson("L1"), lesson("L1b")];
    const both = [at("L1", "R1"), at("L1b", "R2")];

    const equal = await setup();
    await publish(equal, version("h1", both, lessons));
    const same = await prepareAll(equal, version("h2", both, lessons));
    expect(tally(await rowsOf(equal, same.batch.id))).toEqual({ "inalterada/inalterada": 6 });

    const removed = await setup();
    await publish(removed, version("h1", both, lessons));
    const one = await prepareAll(removed, version("h2", [at("L1", "R1")], [lesson("L1")]));
    expect(tally(await rowsOf(removed, one.batch.id))).toEqual({
      "inalterada/inalterada": 3,
      "cancelar/remocao": 3,
    });
    await applyAll(removed, one.batch.id);
    const stillActive = (await occupationsOf(removed)).filter((o) => o.status === "ativa");
    expect(stillActive.map((o) => o.spaceId)).toEqual(Array(3).fill(removed.spaces.R1));

    const moved = await setup();
    await publish(moved, version("h1", both, lessons));
    const mv = await prepareAll(moved, version("h2", [at("L1", "R1"), at("L1b", "R3")], lessons));
    expect(tally(await rowsOf(moved, mv.batch.id))).toEqual({
      "inalterada/inalterada": 3,
      "cancelar/alteracao": 3,
      "pendente/alteracao": 3,
    });

    const added = await setup();
    await publish(added, version("h1", both, lessons));
    const three = await prepareAll(
      added,
      version("h2", [...both, at("L1c", "R3")], [...lessons, lesson("L1c")]),
    );
    expect(tally(await rowsOf(added, three.batch.id))).toEqual({
      "inalterada/inalterada": 6,
      "pendente/inclusao": 3,
    });
  });

  test("a cadeia de versões: voltar uma aula à sala original cria nova ocupação, não reativa a antiga", async () => {
    const env = await setup();
    const v1 = await publish(env, version("h1", [at("L1", "R1")]));
    const v2 = await publish(env, version("h2", [at("L1", "R2")]));
    const prepared = await prepareAll(env, version("h3", [at("L1", "R1")]));
    expect(prepared.batch.supersedesBatchId).toBe(v2.id);
    expect(v2.supersedesBatchId).toBe(v1.id);
    expect(v1.supersedesBatchId).toBeNull();
    expect(tally(await rowsOf(env, prepared.batch.id))).toEqual({
      "cancelar/alteracao": 3,
      "pendente/alteracao": 3,
    });
    await applyAll(env, prepared.batch.id);
    const all = await occupationsOf(env);
    const active = all.filter((o) => o.status === "ativa");
    expect(active).toHaveLength(3);
    expect(
      active.every((o) => o.batchId === prepared.batch.id && o.spaceId === env.spaces.R1),
    ).toBe(true);
    expect(all.filter((o) => o.batchId === v1.id).every((o) => o.status === "cancelada")).toBe(
      true,
    );
    expect(all).toHaveLength(9);
  });

  test("arquivo idêntico a uma versão já aplicada continua reconhecido pelo hash, sem diff", async () => {
    const env = await setup();
    const v1 = await publish(env, version("h1", [at("L1", "R1")]));
    const v2 = await publish(env, version("h2", [at("L1", "R2")]));
    const again = await env.service.prepare(input(env, version("h2", [at("L1", "R2")])));
    expect(again.ok && again.value.reused).toBe(true);
    expect(again.ok && again.value.batch.id).toBe(v2.id);
    const old = await env.service.prepare(input(env, version("h1", [at("L1", "R1")])));
    expect(old.ok && old.value.batch.id).toBe(v1.id);
    expect(old.ok && old.value.reused).toBe(true);
    expect(await env.db.select().from(schema.importBatches)).toHaveLength(2);
    expect((await occupationsOf(env)).filter((o) => o.status === "ativa")).toHaveLength(3);
  });

  test("sem versão aplicada o preparo é o da Fase 1b (sem tipo de mudança nem resumo de versão)", async () => {
    const env = await setup();
    const draft = await prepareAll(env, version("h1", [at("L1", "R1")]));
    const again = await prepareAll(env, version("h2", [at("L1", "R1")]));
    expect(again.batch.supersedesBatchId).toBeNull();
    expect(again.batch.summary.version).toBeUndefined();
    expect(again.batch.summary.counts.pendente).toBe(3);
    expect(draft.batch.summary.version).toBeUndefined();
    expect((await rowsOf(env, again.batch.id)).every((r) => r.changeKind === null)).toBe(true);
  });

  test("primeira versão: aulas do arquivo no mesmo espaço e horário viram conflito no arquivo", async () => {
    const env = await setup();
    const prepared = await prepareAll(env, version("h1", [at("L1", "R1"), at("B2", "R1")]));
    expect(tally(await rowsOf(env, prepared.batch.id))).toEqual({ "conflito_interno/-": 6 });
  });

  test("lote aplicado só com conflitos ainda conta como versão vigente (sem ocupações)", async () => {
    const env = await setup();
    await env.db
      .insert(schema.occupations)
      .values(manualBooking(env.spaces.R1, "2026-08-03T07:00", "2026-08-17T23:00"));
    const first = await publish(env, version("h1", [at("L1", "R1")]));
    expect(first.summary.counts.conflito).toBe(3);
    const next = await prepareAll(env, version("h2", [at("L1", "R1")]));
    expect(next.batch.supersedesBatchId).toBe(first.id);
    expect(next.batch.summary.counts.conflito).toBe(3);
  });

  test("preparo da nova versão é retomável e refeito se a vigente muda no meio", async () => {
    const env = await setup();
    const lessons: Lesson[] = [];
    const slots: WeeklySlot[] = [];
    for (let index = 0; index < 20; index++) {
      lessons.push(lesson(`L${index}`));
      slots.push(at(`L${index}`, "R1", 6 + index));
    }
    await publish(env, { slots, lessons, hash: "h1" });
    const v2 = { slots, lessons, hash: "h2" };
    const partial = await env.service.prepare(input(env, v2), { maxCalls: 1 });
    expect(partial.ok && partial.value.done).toBe(false);
    expect(partial.ok && partial.value.remaining).toBe(10);
    const [victim] = (await occupationsOf(env)).filter((o) => o.startsAt.startsWith("2026-08-10"));
    if (!victim) throw new Error("sem ocupação");
    await env.db
      .update(schema.occupations)
      .set({ status: "cancelada" })
      .where(eq(schema.occupations.id, victim.id));
    const done = await prepareAll(env, v2);
    expect(done.batch.summary.counts).toMatchObject({ inalterada: 59, mantida_cancelada: 1 });
    expect(done.batch.summary.rows).toBe(60);
    expect(
      await env.db
        .select()
        .from(schema.importRows)
        .where(eq(schema.importRows.batchId, done.batch.id)),
    ).toHaveLength(60);
  });
});

describe("nova versão: aula aplicada cuja nova ocorrência não é aplicável", () => {
  const heldRows = (rows: ImportRow[]) => rows.filter((r) => r.status === "alteracao_bloqueada");

  async function expectHeld(env: Env, v2: Version, label: string) {
    const prepared = await prepareAll(env, v2);
    const rows = await rowsOf(env, prepared.batch.id);
    const held = heldRows(rows);
    expect(held).toHaveLength(3);
    for (const row of held) {
      expect(row).toMatchObject({
        changeKind: "alteracao",
        reasonCode: "versao_nao_aplicavel",
        reasonDetail: `Nova versão não aplicável: ${label}`,
      });
    }
    expect(rows.some((r) => r.status === "cancelar")).toBe(false);
    expect(prepared.batch.summary.version?.remocoes).toBe(0);
    expect(prepared.batch.summary.version?.bloqueadas).toBe(3);
    await applyAll(env, prepared.batch.id);
    const mine = (await occupationsOf(env)).filter((o) => o.source === "import");
    expect(mine.every((o) => o.status === "ativa" && o.cancelReason === null)).toBe(true);
  }

  test("várias salas na nova versão: as ocupações são seguradas, não canceladas", async () => {
    const env = await setup();
    await publish(env, version("h1", [at("L1", "R1")]));
    await expectHeld(
      env,
      version("h2", [at("L1", "R1", 8, { status: "multiple_rooms", classroomIds: ["R1", "R2"] })]),
      "Aula com várias salas",
    );
  });

  test("sala sem vínculo na nova versão: seguradas", async () => {
    const env = await setup();
    await publish(env, version("h1", [at("L1", "R1")]));
    await expectHeld(env, version("h2", [at("L1", "R9")]), "Sala sem vínculo");
  });

  test("duração sem datas na nova versão: seguradas", async () => {
    const env = await setup();
    await publish(env, version("h1", [at("L1", "R1")]));
    await expectHeld(
      env,
      version("h2", [at("L1", "R1", 8, { termsMask: "1" })]),
      "Duração sem datas no semestre",
    );
  });

  test("sala ignorada na nova versão: continua cancelando, com o motivo na linha", async () => {
    const env = await setup();
    await publish(env, version("h1", [at("L1", "R1")]));
    await createMappingRepositories(env.db).rooms.saveMany(
      [{ sourceRoomId: "R9", sourceShort: "R9", spaceId: null, ignored: true }],
      "t",
    );
    const prepared = await prepareAll(env, version("h2", [at("L1", "R9")]));
    const rows = await rowsOf(env, prepared.batch.id);
    const cancels = rows.filter((r) => r.status === "cancelar");
    expect(cancels).toHaveLength(3);
    for (const row of cancels) {
      expect(row).toMatchObject({ changeKind: "remocao", reasonCode: "room_ignored" });
    }
    await applyAll(env, prepared.batch.id);
    const done = (await rowsOf(env, prepared.batch.id)).filter(
      (r) => r.status === "cancelada_versao",
    );
    expect(done).toHaveLength(3);
    expect(done.every((r) => r.reasonCode === "room_ignored")).toBe(true);
    const old = (await occupationsOf(env)).filter((o) => o.source === "import");
    expect(old.every((o) => o.status === "cancelada" && o.cancelReason === "nova_versao")).toBe(
      true,
    );
  });

  test("seguradas contam como permanecendo: outra aula não entra no lugar delas", async () => {
    const env = await setup();
    await publish(env, version("h1", [at("L1", "R1")]));
    const prepared = await prepareAll(
      env,
      version(
        "h2",
        [
          at("L1", "R1", 8, { status: "multiple_rooms", classroomIds: ["R1", "R2"] }),
          at("B1", "R1"),
        ],
        [lesson("L1"), lesson("B1", ["T1"], "S2")],
      ),
    );
    const rows = await rowsOf(env, prepared.batch.id);
    expect(heldRows(rows)).toHaveLength(3);
    const incoming = rows.filter((r) => r.lessonId === "B1");
    expect(incoming).toHaveLength(3);
    expect(incoming.every((r) => r.status === "conflito")).toBe(true);
  });

  test("misto: dias aplicáveis seguem o diff e os não aplicáveis ficam segurados", async () => {
    const env = await setup();
    await publish(env, version("h1", [at("L1", "R1"), at("L1", "R1", 8, { weekday: 2 })]));
    const prepared = await prepareAll(
      env,
      version("h2", [
        at("L1", "R2"),
        at("L1", "R1", 8, { weekday: 2, status: "multiple_rooms", classroomIds: ["R1", "R2"] }),
      ]),
    );
    const rows = await rowsOf(env, prepared.batch.id);
    const held = heldRows(rows);
    expect(held.map((r) => r.weekday)).toEqual([2, 2, 2]);
    expect(rows.filter((r) => r.status === "cancelar").map((r) => r.weekday)).toEqual([0, 0, 0]);
    expect(rows.filter((r) => r.status === "pendente")).toHaveLength(3);
  });
});

describe("nova versão: bloqueios em cascata", () => {
  test("P1: ocupação segurada por grupo bloqueado ocupa o lugar; outra aula não é movida para lá", async () => {
    const env = await setup();
    await publish(env, version("h1", [at("L1", "R1"), at("B2", "R2")]));
    await env.db.insert(schema.occupations).values(manualBooking(env.spaces.R3));
    // L1 -> R3 (avulsa em 10/08: bloqueada, fica em R1); B2 -> R1 (R1 segurada por L1)
    const prepared = await prepareAll(env, version("h2", [at("L1", "R3"), at("B2", "R1")]));
    const ten = (await rowsOf(env, prepared.batch.id)).filter((r) => r.date === "2026-08-10");
    expect(ten.filter((r) => r.status === "alteracao_bloqueada")).toHaveLength(2);
    expect(ten.some((r) => r.status === "cancelar" || r.status === "pendente")).toBe(false);
    expect(prepared.batch.summary.version).toMatchObject({ alteracoes: 4, bloqueadas: 2 });
    await applyAll(env, prepared.batch.id);
    const onTen = (await occupationsOf(env)).filter(
      (o) => o.startsAt.startsWith("2026-08-10") && o.source === "import",
    );
    expect(
      onTen
        .filter((o) => o.status === "ativa")
        .map((o) => [o.title, o.spaceId])
        .sort(),
    ).toEqual(
      [
        ["ALG — T1A", env.spaces.R1],
        ["BD — T1A", env.spaces.R2],
      ].sort(),
    );
  });

  test("cadeia de três grupos que se bloqueiam em sequência", async () => {
    const env = await setup();
    await publish(env, version("h1", [at("L1", "R1"), at("B2", "R2"), at("C3", "R3")]));
    await env.db.insert(schema.occupations).values(manualBooking(env.spaces.R4));
    const prepared = await prepareAll(
      env,
      version("h2", [at("L1", "R4"), at("B2", "R1"), at("C3", "R2")]),
    );
    const ten = (await rowsOf(env, prepared.batch.id)).filter((r) => r.date === "2026-08-10");
    expect(ten.some((r) => r.status === "cancelar")).toBe(false);
    expect(prepared.batch.summary.version?.bloqueadas).toBe(3);
    await applyAll(env, prepared.batch.id);
    const active = (await occupationsOf(env)).filter(
      (o) => o.startsAt.startsWith("2026-08-10") && o.source === "import" && o.status === "ativa",
    );
    expect(active.map((o) => o.spaceId).sort()).toEqual(
      [env.spaces.R1, env.spaces.R2, env.spaces.R3].sort(),
    );
  });
});

describe("nova versão: um lote em andamento por semestre", () => {
  async function twoDrafts() {
    const env = await setup();
    await publish(env, twelve("R1", "h1"));
    const v2 = await prepareAll(env, twelve("R2", "h2"));
    const v3 = await prepareAll(env, twelve("R3", "h3"));
    return { env, v2, v3 };
  }

  test("P2: com a v2 em andamento a v3, preparada sobre a mesma base, é recusada; depois, desatualizada", async () => {
    const { env, v2, v3 } = await twoDrafts();
    env.clock.time += 1000;
    const step = await env.service.apply(v2.batch.id, { maxChunks: 1 });
    expect(step.ok && step.value.batch.status).toBe("aplicando");
    const busy = await env.service.apply(v3.batch.id);
    expect(busy.ok).toBe(false);
    expect(!busy.ok && busy.kind).toBe("conflict");
    expect(!busy.ok && busy.message).toContain("em andamento");
    expect((await env.imports.findBatch(v3.batch.id))?.status).toBe("rascunho");
    await applyAll(env, v2.batch.id);
    const stale = await env.service.apply(v3.batch.id);
    expect(!stale.ok && stale.kind).toBe("conflict");
    expect(!stale.ok && stale.message).toContain("Outra versão");
    const active = (await occupationsOf(env)).filter((o) => o.status === "ativa");
    expect(active).toHaveLength(36);
    expect(active.every((o) => o.spaceId === env.spaces.R2)).toBe(true);
  });

  test("P3: preparar outra versão com um lote aplicando é recusado", async () => {
    const { env, v2 } = await twoDrafts();
    await env.service.apply(v2.batch.id, { maxChunks: 1 });
    const refused = await env.service.prepare(input(env, twelve("R3", "h4")));
    expect(!refused.ok && refused.kind).toBe("conflict");
    expect(!refused.ok && refused.message).toContain("em andamento");
    // o próprio lote em andamento continua reconhecido pelo hash
    const same = await env.service.prepare(input(env, twelve("R2", "h2")));
    expect(same.ok && same.value.reused).toBe(true);
    await applyAll(env, v2.batch.id);
    const after = await env.service.prepare(input(env, twelve("R3", "h4")));
    expect(after.ok).toBe(true);
  });

  test("lote falhou bloqueia os outros até ser retomado", async () => {
    const fail = { on: false };
    const env = await setup((repo) => ({
      ...repo,
      applyRows: async (batchId, rows, createdAt) => {
        if (fail.on) throw new Error("banco indisponível");
        return repo.applyRows(batchId, rows, createdAt);
      },
    }));
    await publish(env, twelve("R1", "h1"));
    const v2 = await prepareAll(env, twelve("R2", "h2"));
    const v3 = await prepareAll(env, twelve("R3", "h3"));
    fail.on = true;
    const failed = await env.service.apply(v2.batch.id);
    expect(failed.ok && failed.value.batch.status).toBe("falhou");
    expect((await env.service.prepare(input(env, twelve("R3", "h5")))).ok).toBe(false);
    const other = await env.service.apply(v3.batch.id);
    expect(!other.ok && other.kind).toBe("conflict");
    fail.on = false;
    const resumed = await applyAll(env, v2.batch.id);
    expect(resumed.batch.status).toBe("aplicado");
    expect((await occupationsOf(env)).filter((o) => o.status === "ativa")).toHaveLength(36);
  });
});

describe("descartar lote", () => {
  test("rascunho pode ser descartado; aplicado e inexistente não", async () => {
    const env = await setup();
    const applied = await publish(env, version("h1", [at("L1", "R1")]));
    const draft = await prepareAll(env, version("h2", [at("L1", "R2")]));
    const ok = await env.service.discardBatch(draft.batch.id);
    expect(ok.ok).toBe(true);
    expect(await env.imports.findBatch(draft.batch.id)).toBeNull();
    expect(
      await env.db
        .select()
        .from(schema.importRows)
        .where(eq(schema.importRows.batchId, draft.batch.id)),
    ).toHaveLength(0);
    const no = await env.service.discardBatch(applied.id);
    expect(!no.ok && no.kind).toBe("conflict");
    const missing = await env.service.discardBatch("nao-existe");
    expect(!missing.ok && missing.kind).toBe("not_found");
    expect((await occupationsOf(env)).filter((o) => o.status === "ativa")).toHaveLength(3);
  });

  test("falhou sem nada aplicado pode ser descartado e libera o semestre", async () => {
    const env = await setup((repo) => ({
      ...repo,
      applyVersionRows: async () => {
        throw new Error("banco indisponível");
      },
    }));
    await publish(env, twelve("R1", "h1"));
    const v2 = await prepareAll(env, twelve("R2", "h2"));
    const failed = await env.service.apply(v2.batch.id);
    expect(failed.ok && failed.value.batch.status).toBe("falhou");
    const gone = await env.service.discardBatch(v2.batch.id);
    expect(gone.ok).toBe(true);
    expect(await env.imports.findBatch(v2.batch.id)).toBeNull();
    expect((await env.service.prepare(input(env, twelve("R3", "h3")))).ok).toBe(true);
  });

  test("falhou com linhas já aplicadas não pode ser descartado: retome a aplicação", async () => {
    const fail = { on: false };
    const env = await setup((repo) => ({
      ...repo,
      applyRows: async (batchId, rows, createdAt) => {
        if (fail.on) throw new Error("banco indisponível");
        return repo.applyRows(batchId, rows, createdAt);
      },
    }));
    await publish(env, twelve("R1", "h1"));
    const v2 = await prepareAll(env, twelve("R2", "h2"));
    fail.on = true;
    await env.service.apply(v2.batch.id);
    const refused = await env.service.discardBatch(v2.batch.id);
    expect(!refused.ok && refused.kind).toBe("conflict");
    expect(!refused.ok && refused.message).toContain("retome a aplicação");
    expect((await env.imports.findBatch(v2.batch.id))?.status).toBe("falhou");
    expect((await occupationsOf(env)).filter((o) => o.status === "cancelada")).toHaveLength(36);
  });
});

describe("nova versão: interrupção e retomada", () => {
  async function moved(env: Env) {
    await publish(env, twelve("R1", "h1"));
    return prepareAll(env, twelve("R2", "h2"));
  }

  test("Review Focus 4: em passos de um bloco, cancela tudo antes de inserir e nunca cancela duas vezes", async () => {
    const env = await setup();
    const prepared = await moved(env);
    const batchId = prepared.batch.id;
    expect(prepared.batch.summary.counts).toMatchObject({ cancelar: 36, pendente: 36 });
    const cancelledAt = async () =>
      new Map(
        (await occupationsOf(env))
          .filter((o) => o.cancelledAt !== null)
          .map((o) => [o.id, o.cancelledAt]),
      );

    env.clock.time += 1000;
    const one = await env.service.apply(batchId, { maxChunks: 1 });
    expect(one.ok && one.value).toMatchObject({ done: false, remaining: 42 });
    expect(one.ok && one.value.batch.status).toBe("aplicando");
    expect(await occupationsOf(env, batchId)).toHaveLength(0);
    const afterFirst = await cancelledAt();
    expect(afterFirst.size).toBe(30);

    env.clock.time += 1000;
    const two = await env.service.apply(batchId, { maxChunks: 1 });
    expect(two.ok && two.value.remaining).toBe(36);
    expect(await occupationsOf(env, batchId)).toHaveLength(0);
    const afterSecond = await cancelledAt();
    expect(afterSecond.size).toBe(36);
    for (const [id, at] of afterFirst) expect(afterSecond.get(id)).toBe(at);

    env.clock.time += 1000;
    const three = await env.service.apply(batchId, { maxChunks: 1 });
    expect(three.ok && three.value.remaining).toBe(6);
    expect(await occupationsOf(env, batchId)).toHaveLength(30);
    env.clock.time += 1000;
    const four = await env.service.apply(batchId, { maxChunks: 1 });
    expect(four.ok && four.value).toMatchObject({ done: true, remaining: 0 });
    expect(four.ok && four.value.batch.status).toBe("aplicado");
    expect(await occupationsOf(env, batchId)).toHaveLength(36);
    expect(await cancelledAt()).toEqual(afterSecond);
    // reaplicar depois de concluído não muda nada
    const again = await env.service.apply(batchId);
    expect(again.ok && again.value.done).toBe(true);
    expect(await occupationsOf(env)).toHaveLength(72);
  });

  test("um passo com três blocos cruza da fase de cancelamentos para a de inserções", async () => {
    const env = await setup();
    const prepared = await moved(env);
    const step = await env.service.apply(prepared.batch.id, { maxChunks: 3 });
    expect(step.ok && step.value).toMatchObject({ done: false, remaining: 6 });
    expect(await occupationsOf(env, prepared.batch.id)).toHaveLength(30);
  });

  test("falha na fase de inserções: cancelamentos ficam feitos, retomar completa sem duplicar nem cancelar de novo", async () => {
    const fail = { applyRows: false };
    const env = await setup((repo) => ({
      ...repo,
      applyRows: async (batchId, rows, createdAt) => {
        if (fail.applyRows) throw new Error("banco indisponível");
        return repo.applyRows(batchId, rows, createdAt);
      },
    }));
    const prepared = await moved(env);
    fail.applyRows = true;
    const batchId = prepared.batch.id;
    env.clock.time += 1000;
    const first = await env.service.apply(batchId);
    expect(first.ok && first.value.batch.status).toBe("falhou");
    expect(first.ok && first.value.batch.summary.counts).toMatchObject({
      cancelada_versao: 36,
      falha: 30,
      pendente: 6,
    });
    expect(await occupationsOf(env, batchId)).toHaveLength(0);
    const cancelled = (await occupationsOf(env)).map((o) => [o.id, o.cancelledAt]);
    fail.applyRows = false;
    const done = await applyAll(env, batchId);
    expect(done.batch.status).toBe("aplicado");
    expect(await occupationsOf(env, batchId)).toHaveLength(36);
    expect((await occupationsOf(env)).map((o) => o.id).length).toBe(72);
    for (const [id, at] of cancelled) {
      const o = (await occupationsOf(env)).find((item) => item.id === id);
      expect(o?.cancelledAt).toBe(at as string | null);
    }
  });

  test("falha na fase de cancelamentos: nenhuma inserção antes de terminar; retomar refaz só o que falhou", async () => {
    let calls = 0;
    const fail = { on: 2 };
    const env = await setup((repo) => ({
      ...repo,
      applyVersionRows: async (batchId, rows, now) => {
        calls++;
        if (calls === fail.on) throw new Error("banco indisponível");
        return repo.applyVersionRows(batchId, rows, now);
      },
    }));
    const prepared = await moved(env);
    const batchId = prepared.batch.id;
    const first = await env.service.apply(batchId);
    expect(first.ok && first.value.batch.status).toBe("falhou");
    expect(first.ok && first.value.batch.summary.counts).toMatchObject({
      cancelada_versao: 30,
      falha: 6,
      pendente: 36,
    });
    expect(await occupationsOf(env, batchId)).toHaveLength(0);
    const failed = (await rowsOf(env, batchId)).filter((r) => r.status === "falha");
    expect(failed.every((r) => r.rowKey.startsWith("c:") && r.reasonCode === "erro_gravacao")).toBe(
      true,
    );
    fail.on = -1;
    const done = await applyAll(env, batchId);
    expect(done.batch.status).toBe("aplicado");
    expect(done.batch.summary.counts).toMatchObject({
      cancelada_versao: 36,
      aplicada: 36,
      falha: 0,
      pendente: 0,
    });
    const all = await occupationsOf(env);
    expect(all.filter((o) => o.status === "ativa")).toHaveLength(36);
    expect(all.filter((o) => o.status === "cancelada")).toHaveLength(36);
  });

  test("ocupação cancelada por outra pessoa entre o preparo e a aplicação não é cancelada de novo", async () => {
    const env = await setup();
    await publish(env, version("h1", [at("L1", "R1")]));
    const prepared = await prepareAll(env, version("h2", [at("L1", "R2")]));
    const [other] = await occupationsOf(env);
    if (!other) throw new Error("sem ocupação");
    await env.db
      .update(schema.occupations)
      .set({ status: "cancelada", cancelReason: "manual", cancelledAt: "antes" })
      .where(eq(schema.occupations.id, other.id));
    await applyAll(env, prepared.batch.id);
    const row = (await rowsOf(env, prepared.batch.id)).find((r) => r.occupationId === other.id);
    expect(row).toMatchObject({ status: "cancelada_versao", reasonCode: "ja_cancelada" });
    const after = (await occupationsOf(env)).find((o) => o.id === other.id);
    expect(after).toMatchObject({ cancelReason: "manual", cancelledAt: "antes" });
    const others = (await rowsOf(env, prepared.batch.id)).filter(
      (r) => r.status === "cancelada_versao" && r.occupationId !== other.id,
    );
    expect(others.every((r) => r.reasonCode === null)).toBe(true);
  });

  test("responsável não é alterado em ocupação que deixou de estar ativa", async () => {
    const env = await setup();
    await publish(env, version("h1", [at("L1", "R1")]));
    const prepared = await prepareAll(env, version("h2", [at("L1", "R1")], [lesson("L1", ["T2"])]));
    const [other] = await occupationsOf(env);
    if (!other) throw new Error("sem ocupação");
    await env.db
      .update(schema.occupations)
      .set({ status: "cancelada" })
      .where(eq(schema.occupations.id, other.id));
    await applyAll(env, prepared.batch.id);
    const row = (await rowsOf(env, prepared.batch.id)).find((r) => r.occupationId === other.id);
    expect(row).toMatchObject({ status: "responsavel_atualizado", reasonCode: "ja_cancelada" });
    expect((await occupationsOf(env)).find((o) => o.id === other.id)?.responsibleUserId).toBe(
      "user-t1",
    );
  });

  test("reserva avulsa nunca é cancelada nem alterada por uma linha de versão", async () => {
    const env = await setup();
    await publish(env, version("h1", [at("L1", "R1")]));
    const prepared = await prepareAll(env, version("h2", [at("L1", "R2")]));
    await env.db.insert(schema.occupations).values(manualBooking(env.spaces.R3));
    // força uma linha de cancelamento apontando para a avulsa
    await env.db
      .update(schema.importRows)
      .set({ occupationId: "manual-1" })
      .where(
        and(
          eq(schema.importRows.batchId, prepared.batch.id),
          eq(schema.importRows.status, "cancelar"),
        ),
      );
    await applyAll(env, prepared.batch.id);
    expect((await occupationsOf(env)).find((o) => o.id === "manual-1")).toMatchObject({
      status: "ativa",
      cancelReason: null,
    });
  });

  test("lote preparado sobre uma versão que já não é a última é recusado na aplicação", async () => {
    const env = await setup();
    await publish(env, version("h1", [at("L1", "R1")]));
    const stale = await prepareAll(env, version("h2", [at("L1", "R2")]));
    await publish(env, version("h3", [at("L1", "R3")]));
    const refused = await env.service.apply(stale.batch.id);
    expect(refused.ok).toBe(false);
    expect(!refused.ok && refused.kind).toBe("conflict");
    expect(await occupationsOf(env, stale.batch.id)).toHaveLength(0);
    const batch = await env.imports.findBatch(stale.batch.id);
    expect(batch?.status).toBe("rascunho");
  });
});

describe("tipos de linha", () => {
  test("contagens e tipos acompanham exatamente os enums do esquema", () => {
    expect(Object.keys(EMPTY_COUNTS).sort()).toEqual(
      [...schema.importRows.status.enumValues].sort(),
    );
    expect(schema.importRows.changeKind.enumValues).toEqual([
      "inclusao",
      "alteracao",
      "remocao",
      "inalterada",
      "mantida_cancelada",
      "responsavel",
    ]);
  });
});
