import { Database } from "bun:sqlite";
import { beforeEach, describe, expect, test } from "bun:test";
import { asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import * as schema from "#/infra/db/schema";
import { createUserRepository } from "./user-repository";

async function setup() {
  const sqlite = new Database(":memory:");
  sqlite.run("PRAGMA foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "drizzle" });
  const user = (id: string, over: Partial<typeof schema.users.$inferInsert> = {}) =>
    db.insert(schema.users).values({
      id,
      email: `${id}@ifsc.edu.br`,
      name: id,
      code: id.toUpperCase(),
      roles: "docente",
      passwordHash: "h",
      active: true,
      placeholder: false,
      createdAt: "t",
      updatedAt: "t",
      ...over,
    });
  await user("fantasma", { placeholder: true });
  await user("outra-fantasma", { placeholder: true });
  await user("real");
  await user("inativa", { active: false });
  await db
    .insert(schema.spaces)
    .values({ id: "sp", name: "Lab 1", capacity: null, createdAt: "t" });
  const occupation = (id: string, over: Partial<typeof schema.occupations.$inferInsert>) =>
    db.insert(schema.occupations).values({
      id,
      spaceId: "sp",
      startsAt: `2026-08-03T0${id.length % 9}:00`,
      endsAt: `2026-08-03T0${id.length % 9}:50`,
      source: "import",
      lessonId: id,
      title: id,
      status: "ativa",
      createdAt: "t",
      ...over,
    });
  await occupation("aula", { responsibleUserId: "fantasma" });
  await occupation("aula-real", { responsibleUserId: "real" });
  await occupation("avulsa", {
    source: "manual",
    lessonId: null,
    responsibleUserId: "fantasma",
    createdBy: "fantasma",
  });
  await db.insert(schema.teacherMappings).values([
    { sourceTeacherId: "P1", sourceShort: "FA", userId: "fantasma", updatedAt: "t" },
    { sourceTeacherId: "P2", sourceShort: "RE", userId: "real", updatedAt: "t" },
  ]);
  await db.insert(schema.sessions).values({
    id: "s1",
    userId: "fantasma",
    tokenHash: "tk",
    createdAt: "t",
    expiresAt: "t",
    lastSeenAt: "t",
  });
  const snapshot = async () => ({
    users: (await db.select().from(schema.users).orderBy(asc(schema.users.id))).map((u) => u.id),
    occupations: await db
      .select({
        id: schema.occupations.id,
        responsibleUserId: schema.occupations.responsibleUserId,
        createdBy: schema.occupations.createdBy,
      })
      .from(schema.occupations)
      .orderBy(asc(schema.occupations.id)),
    mappings: await db
      .select({
        sourceTeacherId: schema.teacherMappings.sourceTeacherId,
        userId: schema.teacherMappings.userId,
      })
      .from(schema.teacherMappings)
      .orderBy(asc(schema.teacherMappings.sourceTeacherId)),
    sessions: (await db.select().from(schema.sessions)).map((s) => s.userId),
  });
  return { db, repo: createUserRepository(db), snapshot };
}

describe("mergeInto", () => {
  let env: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    env = await setup();
  });

  test("move responsável, created_by e vínculos para a conta escolhida e apaga a fantasma", async () => {
    expect(await env.repo.mergeInto("fantasma", "real")).toBe(true);

    expect(await env.snapshot()).toEqual({
      users: ["inativa", "outra-fantasma", "real"],
      occupations: [
        { id: "aula", responsibleUserId: "real", createdBy: null },
        { id: "aula-real", responsibleUserId: "real", createdBy: null },
        { id: "avulsa", responsibleUserId: "real", createdBy: "real" },
      ],
      mappings: [
        { sourceTeacherId: "P1", userId: "real" },
        { sourceTeacherId: "P2", userId: "real" },
      ],
      sessions: [],
    });
  });

  test("alvo fantasma, alvo inativo, origem que não é fantasma, mesma conta ou inexistente: nada muda", async () => {
    const before = await env.snapshot();
    for (const [from, to] of [
      ["fantasma", "outra-fantasma"],
      ["fantasma", "inativa"],
      ["real", "fantasma"],
      ["inativa", "real"],
      ["fantasma", "fantasma"],
      ["nao-existe", "real"],
      ["fantasma", "nao-existe"],
    ]) {
      expect(await env.repo.mergeInto(from ?? "", to ?? "")).toBe(false);
      expect(await env.snapshot()).toEqual(before);
    }
  });
});

describe("activatePlaceholder", () => {
  let env: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    env = await setup();
  });

  test("grava e-mail e senha e remove a marca de fantasma", async () => {
    expect(await env.repo.activatePlaceholder("fantasma", "  Nova.Conta@IFSC.edu.br ", "h2")).toBe(
      true,
    );

    const record = await env.repo.findByEmail("nova.conta@ifsc.edu.br");
    expect(record).toMatchObject({ id: "fantasma", placeholder: false, passwordHash: "h2" });
    expect((await env.repo.findById("fantasma"))?.placeholder).toBe(false);
  });

  test("conta que não é fantasma (ou não existe) não muda", async () => {
    expect(await env.repo.activatePlaceholder("real", "x@ifsc.edu.br", "h2")).toBe(false);
    expect(await env.repo.activatePlaceholder("nao-existe", "x@ifsc.edu.br", "h2")).toBe(false);
    const [row] = await env.db.select().from(schema.users).where(eq(schema.users.id, "real"));
    expect(row).toMatchObject({ email: "real@ifsc.edu.br", passwordHash: "h" });
  });

  test("e-mail já usado por outra conta estoura a restrição única sem ativar", async () => {
    await expect(
      env.repo.activatePlaceholder("fantasma", "real@ifsc.edu.br", "h2"),
    ).rejects.toThrow();
    expect((await env.repo.findById("fantasma"))?.placeholder).toBe(true);
  });
});
