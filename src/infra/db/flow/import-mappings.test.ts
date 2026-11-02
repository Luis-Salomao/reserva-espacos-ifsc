import { Database } from "bun:sqlite";
import { beforeEach, describe, expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { createMappingsService } from "#/application/import-mappings";
import type { User } from "#/domain/user";
import type { AppDb } from "#/infra/db/client";
import { createMappingRepositories } from "#/infra/db/repos/mapping-repositories";
import { createSpaceRepository } from "#/infra/db/repos/space-repository";
import { createUserRepository } from "#/infra/db/repos/user-repository";
import * as schema from "#/infra/db/schema";

const clock = { now: () => new Date("2026-08-01T12:00:00Z") };

function open(): AppDb {
  const sqlite = new Database(":memory:");
  sqlite.run("PRAGMA foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "drizzle" });
  return db;
}

type Env = {
  service: ReturnType<typeof createMappingsService>;
  maps: ReturnType<typeof createMappingRepositories>;
  lab: string;
  sala: string;
  maria: User;
  inactive: User;
};

async function setup(): Promise<Env> {
  const db = open();
  const spaces = createSpaceRepository(db);
  const users = createUserRepository(db);
  const maps = createMappingRepositories(db);
  const lab = (await spaces.create({ name: "Laboratório 1", capacity: 30 })).id;
  const sala = (await spaces.create({ name: "Sala 2", capacity: null })).id;
  const maria = await users.create({
    email: "maria@x.org",
    name: "Maria",
    code: "MAR",
    roles: ["docente"],
    passwordHash: "x",
  });
  const inactive = await users.create({
    email: "joao@x.org",
    name: "João",
    code: "JOA",
    roles: ["docente"],
    passwordHash: "x",
  });
  await users.setActive(inactive.id, false);
  const service = createMappingsService({
    rooms: maps.rooms,
    teachers: maps.teachers,
    spaces,
    users,
    clock,
  });
  return { service, maps, lab, sala, maria, inactive: { ...inactive, active: false } };
}

describe("sugestões de salas", () => {
  let env: Env;
  beforeEach(async () => {
    env = await setup();
  });

  test("sem vínculo salvo: sugere por nome do espaço, senão nada", async () => {
    const result = await env.service.suggestRooms([
      { id: "R1", short: "L1", name: "laboratório 1" },
      { id: "R2", short: "Sala 2", name: "Outra" },
      { id: "R3", short: "X", name: "Auditório" },
    ]);
    expect(result[0]).toMatchObject({
      sourceId: "R1",
      saved: null,
      suggestion: { target: { spaceId: env.lab, ignored: false }, origin: "nome" },
    });
    expect(result[1]?.suggestion).toMatchObject({ origin: "nome", target: { spaceId: env.sala } });
    expect(result[2]).toMatchObject({ saved: null, suggestion: null });
  });

  test("vínculo salvo pela id aparece como salvo, sem sugestão", async () => {
    await env.service.saveRooms([
      { sourceRoomId: "R1", sourceShort: "L1", spaceId: env.lab, ignored: false },
      { sourceRoomId: "R2", sourceShort: "AUD", spaceId: null, ignored: true },
    ]);
    const result = await env.service.suggestRooms([
      { id: "R1", short: "L1", name: "?" },
      { id: "R2", short: "AUD", name: "?" },
    ]);
    expect(result[0]).toMatchObject({
      saved: { spaceId: env.lab, ignored: false },
      suggestion: null,
    });
    expect(result[1]).toMatchObject({ saved: { spaceId: null, ignored: true }, suggestion: null });
  });

  test("id diferente na nova exportação: sugere pela mesma sigla, nunca aplica sozinho", async () => {
    await env.service.saveRooms([
      { sourceRoomId: "OLD", sourceShort: "L1", spaceId: env.sala, ignored: false },
    ]);
    const result = await env.service.suggestRooms([{ id: "NEW", short: "l1", name: "?" }]);
    expect(result[0]).toMatchObject({
      saved: null,
      suggestion: { origin: "sigla", target: { spaceId: env.sala, ignored: false } },
    });
    const rooms = await env.maps.rooms.list();
    expect(rooms.map((r) => r.sourceRoomId)).toEqual(["OLD"]);
  });

  test("mesma sigla com destinos diferentes: não sugere pela sigla", async () => {
    await env.service.saveRooms([
      { sourceRoomId: "A", sourceShort: "L1", spaceId: env.sala, ignored: false },
      { sourceRoomId: "B", sourceShort: "L1", spaceId: env.lab, ignored: false },
    ]);
    const result = await env.service.suggestRooms([{ id: "NEW", short: "L1", name: "?" }]);
    expect(result[0]?.suggestion).toBeNull();
  });

  test("vínculo limpo (sem espaço e sem ignorar) não vira sugestão", async () => {
    await env.service.saveRooms([
      { sourceRoomId: "A", sourceShort: "L1", spaceId: null, ignored: false },
    ]);
    const result = await env.service.suggestRooms([{ id: "NEW", short: "L1", name: "?" }]);
    expect(result[0]).toMatchObject({ saved: null, suggestion: null });
  });
});

describe("salvar vínculos de salas", () => {
  let env: Env;
  beforeEach(async () => {
    env = await setup();
  });

  test("grava e atualiza pela id de origem", async () => {
    const first = await env.service.saveRooms([
      { sourceRoomId: "R1", sourceShort: "L1", spaceId: env.lab, ignored: false },
    ]);
    expect(first.ok).toBe(true);
    await env.service.saveRooms([
      { sourceRoomId: "R1", sourceShort: "L1b", spaceId: env.sala, ignored: false },
    ]);
    const rooms = await env.maps.rooms.list();
    expect(rooms).toEqual([
      { sourceRoomId: "R1", sourceShort: "L1b", spaceId: env.sala, ignored: false },
    ]);
  });

  test("recusa espaço inexistente, espaço com ignorar e campos inválidos", async () => {
    const unknown = await env.service.saveRooms([
      { sourceRoomId: "R1", sourceShort: "L1", spaceId: "nao-existe", ignored: false },
    ]);
    expect(!unknown.ok && unknown.kind).toBe("validation");
    const both = await env.service.saveRooms([
      { sourceRoomId: "R1", sourceShort: "L1", spaceId: env.lab, ignored: true },
    ]);
    expect(!both.ok && both.kind).toBe("validation");
    const empty = await env.service.saveRooms([
      { sourceRoomId: " ", sourceShort: "L1", spaceId: null, ignored: true },
    ]);
    expect(!empty.ok).toBe(true);
    const tooMany = await env.service.saveRooms(
      Array.from({ length: 501 }, (_, i) => ({
        sourceRoomId: `R${i}`,
        sourceShort: "x",
        spaceId: null,
        ignored: true,
      })),
    );
    expect(!tooMany.ok && tooMany.kind).toBe("validation");
    expect(await env.maps.rooms.list()).toEqual([]);
  });

  test("nada é gravado se um item é inválido", async () => {
    const result = await env.service.saveRooms([
      { sourceRoomId: "R1", sourceShort: "L1", spaceId: env.lab, ignored: false },
      { sourceRoomId: "R2", sourceShort: "L2", spaceId: "nao-existe", ignored: false },
    ]);
    expect(result.ok).toBe(false);
    expect(await env.maps.rooms.list()).toEqual([]);
  });

  test("lista vazia é aceita", async () => {
    expect((await env.service.saveRooms([])).ok).toBe(true);
  });
});

describe("docentes", () => {
  let env: Env;
  beforeEach(async () => {
    env = await setup();
  });

  test("sugere pela sigla da conta ativa; conta inativa não é sugerida", async () => {
    const result = await env.service.suggestTeachers([
      { id: "T1", short: "mar" },
      { id: "T2", short: "JOA" },
      { id: "T3", short: "ZZZ" },
    ]);
    expect(result[0]).toMatchObject({
      saved: null,
      suggestion: { userId: env.maria.id, origin: "codigo" },
    });
    expect(result[1]?.suggestion).toBeNull();
    expect(result[2]?.suggestion).toBeNull();
  });

  test("vínculo salvo pela id, ou sugestão pela mesma sigla de outra id", async () => {
    const saved = await env.service.saveTeachers([
      { sourceTeacherId: "T1", sourceShort: "MAR", userId: env.maria.id },
      { sourceTeacherId: "T2", sourceShort: "SEM", userId: null },
    ]);
    expect(saved.ok).toBe(true);
    const result = await env.service.suggestTeachers([
      { id: "T1", short: "MAR" },
      { id: "T2", short: "SEM" },
      { id: "T9", short: "MAR" },
    ]);
    expect(result[0]).toMatchObject({ saved: { userId: env.maria.id }, suggestion: null });
    expect(result[1]).toMatchObject({ saved: { userId: null }, suggestion: null });
    expect(result[2]).toMatchObject({
      saved: null,
      suggestion: { userId: env.maria.id, origin: "sigla" },
    });
  });

  test("sigla salva com contas diferentes: não sugere (precisa de unanimidade)", async () => {
    await env.service.saveTeachers([
      { sourceTeacherId: "A", sourceShort: "XYZ", userId: env.maria.id },
    ]);
    const other = env.inactive.id;
    await env.maps.teachers.saveMany(
      [{ sourceTeacherId: "B", sourceShort: "XYZ", userId: other }],
      "t",
    );
    const result = await env.service.suggestTeachers([{ id: "NOVO", short: "XYZ" }]);
    expect(result[0]?.suggestion).toBeNull();
  });

  test("sem vínculo: grava nulo; recusa conta inexistente, inativa e campos inválidos", async () => {
    const none = await env.service.saveTeachers([
      { sourceTeacherId: "T1", sourceShort: "MAR", userId: null },
    ]);
    expect(none.ok).toBe(true);
    const unknown = await env.service.saveTeachers([
      { sourceTeacherId: "T2", sourceShort: "X", userId: "nao-existe" },
    ]);
    expect(!unknown.ok && unknown.kind).toBe("validation");
    const inactive = await env.service.saveTeachers([
      { sourceTeacherId: "T3", sourceShort: "JOA", userId: env.inactive.id },
    ]);
    expect(!inactive.ok && inactive.kind).toBe("validation");
    const blank = await env.service.saveTeachers([
      { sourceTeacherId: "", sourceShort: "X", userId: null },
    ]);
    expect(blank.ok).toBe(false);
    expect((await env.maps.teachers.list()).map((t) => t.sourceTeacherId)).toEqual(["T1"]);
    expect((await env.service.saveTeachers([])).ok).toBe(true);
  });
});
