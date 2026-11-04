import { Database } from "bun:sqlite";
import { beforeEach, describe, expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { NewPlaceholder } from "#/application/ports";
import { createMappingRepositories } from "#/infra/db/repos/mapping-repositories";
import { createUserRepository } from "#/infra/db/repos/user-repository";
import * as schema from "#/infra/db/schema";

function open() {
  const sqlite = new Database(":memory:");
  sqlite.run("PRAGMA foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "drizzle" });
  return { db, sqlite };
}

const AT = "2026-08-01T12:00:00.000Z";

const ghost = (id: string, email: string, code: string | null): NewPlaceholder => ({
  id,
  email,
  name: `Docente ${id}`,
  code,
  passwordHash: `hash-${id}`,
});

describe("saveWithPlaceholders", () => {
  let env: ReturnType<typeof setup>;
  function setup() {
    const { db, sqlite } = open();
    return {
      sqlite,
      users: createUserRepository(db),
      teachers: createMappingRepositories(db).teachers,
    };
  }
  beforeEach(() => {
    env = setup();
  });

  test("cria as contas fantasmas e grava os vínculos juntos", async () => {
    const real = await env.users.create({
      email: "real@x.org",
      name: "Real",
      code: "REA",
      roles: ["docente"],
      passwordHash: "h",
    });
    await env.teachers.saveWithPlaceholders(
      [ghost("g1", "Zeca.Quintal@ifsc.edu.br", "ZQ"), ghost("g2", "lua@ifsc.edu.br", null)],
      [
        { sourceTeacherId: "P1", sourceShort: "ZQ", userId: "g1" },
        { sourceTeacherId: "P2", sourceShort: "LU", userId: "g2" },
        { sourceTeacherId: "P3", sourceShort: "REA", userId: real.id },
      ],
      AT,
    );
    expect(await env.users.findById("g1")).toEqual({
      id: "g1",
      email: "zeca.quintal@ifsc.edu.br",
      name: "Docente g1",
      code: "ZQ",
      roles: ["docente"],
      active: true,
      placeholder: true,
    });
    expect((await env.users.findByEmail("lua@ifsc.edu.br"))?.passwordHash).toBe("hash-g2");
    expect((await env.users.findById(real.id))?.placeholder).toBe(false);
    expect(await env.teachers.list()).toEqual([
      { sourceTeacherId: "P1", sourceShort: "ZQ", userId: "g1" },
      { sourceTeacherId: "P2", sourceShort: "LU", userId: "g2" },
      { sourceTeacherId: "P3", sourceShort: "REA", userId: real.id },
    ]);
  });

  test("atualiza vínculo existente pela id de origem", async () => {
    await env.teachers.saveMany([{ sourceTeacherId: "P1", sourceShort: "ZQ", userId: null }], AT);
    await env.teachers.saveWithPlaceholders(
      [ghost("g1", "zeca@ifsc.edu.br", "ZQ")],
      [{ sourceTeacherId: "P1", sourceShort: "ZQ", userId: "g1" }],
      AT,
    );
    expect(await env.teachers.list()).toEqual([
      { sourceTeacherId: "P1", sourceShort: "ZQ", userId: "g1" },
    ]);
  });

  test("e-mail duplicado no meio do lote não deixa nenhuma conta nem vínculo", async () => {
    await env.teachers.saveMany([{ sourceTeacherId: "P0", sourceShort: "OLD", userId: null }], AT);
    await expect(
      env.teachers.saveWithPlaceholders(
        [
          ghost("g1", "a@ifsc.edu.br", "AA"),
          ghost("g2", "b@ifsc.edu.br", "BB"),
          ghost("g3", "A@ifsc.edu.br", "CC"),
          ghost("g4", "d@ifsc.edu.br", "DD"),
        ],
        [
          { sourceTeacherId: "P0", sourceShort: "OLD", userId: "g1" },
          { sourceTeacherId: "P1", sourceShort: "AA", userId: "g1" },
          { sourceTeacherId: "P2", sourceShort: "BB", userId: "g2" },
        ],
        AT,
      ),
    ).rejects.toThrow();
    expect(await env.users.list()).toEqual([]);
    expect(await env.teachers.list()).toEqual([
      { sourceTeacherId: "P0", sourceShort: "OLD", userId: null },
    ]);
  });

  test("vínculo que falha depois das contas desfaz também as contas", async () => {
    await expect(
      env.teachers.saveWithPlaceholders(
        [ghost("g1", "a@ifsc.edu.br", "AA")],
        [
          { sourceTeacherId: "P1", sourceShort: "AA", userId: "g1" },
          { sourceTeacherId: "P2", sourceShort: "XX", userId: "conta-inexistente" },
        ],
        AT,
      ),
    ).rejects.toThrow();
    expect(await env.users.list()).toEqual([]);
    expect(await env.teachers.list()).toEqual([]);
  });

  test("listas vazias não gravam nada", async () => {
    await env.teachers.saveWithPlaceholders([], [], AT);
    expect(await env.users.list()).toEqual([]);
    expect(await env.teachers.list()).toEqual([]);
  });
});
