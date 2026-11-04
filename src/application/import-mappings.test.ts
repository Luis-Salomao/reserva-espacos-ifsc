import { Database } from "bun:sqlite";
import { beforeEach, describe, expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { createMappingsService, type TeacherMappingInput } from "#/application/import-mappings";
import { createMappingRepositories } from "#/infra/db/repos/mapping-repositories";
import { createSpaceRepository } from "#/infra/db/repos/space-repository";
import { createUserRepository } from "#/infra/db/repos/user-repository";
import * as schema from "#/infra/db/schema";
import { cryptoRandom } from "#/infra/runtime";

function setup() {
  const sqlite = new Database(":memory:");
  sqlite.run("PRAGMA foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "drizzle" });
  const users = createUserRepository(db);
  const maps = createMappingRepositories(db);
  const service = createMappingsService({
    rooms: maps.rooms,
    teachers: maps.teachers,
    spaces: createSpaceRepository(db),
    users,
    clock: { now: () => new Date("2026-08-01T12:00:00Z") },
    hasher: {
      hash: async (password) => `hash:${password}`,
      verify: async () => false,
      needsRehash: () => false,
    },
    random: cryptoRandom,
  });
  const account = (email: string, code: string | null) =>
    users.create({ email, name: "Conta Real", code, roles: ["docente"], passwordHash: "h" });
  return { service, users, teachers: maps.teachers, account };
}

const ghost = (
  sourceTeacherId: string,
  sourceShort: string,
  name: string,
): TeacherMappingInput => ({
  sourceTeacherId,
  sourceShort,
  userId: null,
  createPlaceholder: { name },
});

describe("saveTeachers com contas fantasmas", () => {
  let env: ReturnType<typeof setup>;
  beforeEach(() => {
    env = setup();
  });

  async function linkedAccount(sourceTeacherId: string) {
    const mapping = (await env.teachers.list()).find((m) => m.sourceTeacherId === sourceTeacherId);
    const user = mapping?.userId ? await env.users.findById(mapping.userId) : null;
    return user ? env.users.findByEmail(user.email) : null;
  }

  test("cria a fantasma com nome do XML, e-mail presumido, sigla, papel docente e a vincula", async () => {
    const result = await env.service.saveTeachers([ghost("P1", "ZQ", "Zeca Quintal")]);
    expect(result).toEqual({ ok: true, value: null });
    const created = await linkedAccount("P1");
    expect(created).toMatchObject({
      name: "Zeca Quintal",
      email: "zeca.quintal@ifsc.edu.br",
      code: "ZQ",
      roles: ["docente"],
      active: true,
      placeholder: true,
    });
    expect(created?.passwordHash).toMatch(/^hash:[A-Za-z0-9_-]{43}$/);
    expect(await env.teachers.list()).toEqual([
      { sourceTeacherId: "P1", sourceShort: "ZQ", userId: created?.id ?? "?" },
    ]);
  });

  test("e-mail presumido repetido ganha sufixo numérico, no envio e contra contas existentes", async () => {
    await env.account("lua.sol@ifsc.edu.br", null);
    await env.service.saveTeachers([
      ghost("P1", "AS1", "Ana Silva"),
      ghost("P2", "AS2", "Ana Souza Silva"),
      ghost("P3", "LS", "Lua Sol"),
    ]);
    expect((await linkedAccount("P1"))?.email).toBe("ana.silva@ifsc.edu.br");
    expect((await linkedAccount("P2"))?.email).toBe("ana.silva2@ifsc.edu.br");
    expect((await linkedAccount("P3"))?.email).toBe("lua.sol2@ifsc.edu.br");
  });

  test("sigla já usada como código (por conta existente ou no mesmo envio) fica sem código", async () => {
    await env.account("real@x.org", "ZQ");
    await env.service.saveTeachers([
      ghost("P1", "ZQ", "Zeca Quintal"),
      ghost("P2", "LU", "Lua Um"),
      ghost("P3", "LU", "Lua Dois"),
    ]);
    expect((await linkedAccount("P1"))?.code).toBeNull();
    expect((await linkedAccount("P2"))?.code).toBe("LU");
    expect((await linkedAccount("P3"))?.code).toBeNull();
  });

  // Sem nome nem sigla no XML, a prévia manda a id do docente como sigla.
  test("nome vazio vira 'Docente sem nome' com e-mail docente.ID@", async () => {
    await env.service.saveTeachers([ghost("P7", "P7", "  ")]);
    expect(await linkedAccount("P7")).toMatchObject({
      name: "Docente sem nome",
      email: "docente.p7@ifsc.edu.br",
    });
  });

  test("reimportar reaproveita a fantasma vinculada e a de mesma sigla, sem duplicar", async () => {
    await env.service.saveTeachers([ghost("P1", "ZQ", "Zeca Quintal")]);
    const first = await linkedAccount("P1");
    await env.service.saveTeachers([ghost("P1", "ZQ", "Zeca Quintal")]);
    await env.service.saveTeachers([ghost("NOVA-ID", "ZQ", "Zeca Quintal")]);
    expect(await env.users.list()).toHaveLength(1);
    expect((await linkedAccount("P1"))?.id).toBe(first?.id ?? "?");
    expect((await linkedAccount("NOVA-ID"))?.id).toBe(first?.id ?? "?");
  });

  test("conta escolhida e criar fantasma no mesmo item é erro e nada é gravado", async () => {
    const real = await env.account("real@x.org", "REA");
    const result = await env.service.saveTeachers([
      { ...ghost("P1", "ZQ", "Zeca Quintal"), userId: real.id },
    ]);
    expect(result).toMatchObject({ ok: false, kind: "validation", field: "userId" });
    expect(await env.users.list()).toHaveLength(1);
    expect(await env.teachers.list()).toEqual([]);
  });

  test("item inválido depois de uma fantasma: nenhuma conta nem vínculo é gravado", async () => {
    const result = await env.service.saveTeachers([
      ghost("P1", "ZQ", "Zeca Quintal"),
      { sourceTeacherId: "P2", sourceShort: "XX", userId: "conta-inexistente" },
    ]);
    expect(result).toMatchObject({ ok: false, kind: "validation" });
    expect(await env.users.list()).toEqual([]);
    expect(await env.teachers.list()).toEqual([]);
  });
});
