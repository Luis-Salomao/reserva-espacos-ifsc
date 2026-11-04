import { Database } from "bun:sqlite";
import { beforeEach, describe, expect, test } from "bun:test";
import { asc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import * as schema from "#/infra/db/schema";
import { createImportRepository } from "./import-repository";

const FROM = "2026-08-03T00:00";
const TO = "2026-08-23T24:00";

type Occupation = typeof schema.occupations.$inferInsert;

async function setup() {
  const sqlite = new Database(":memory:");
  sqlite.run("PRAGMA foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "drizzle" });
  for (const id of ["admin", "u1", "u2"]) {
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
  const semester = (id: string, name: string) =>
    db.insert(schema.semesters).values({
      id,
      name,
      startsOn: "2026-08-03",
      endsOn: "2026-08-23",
      createdAt: "t",
      updatedAt: "t",
    });
  await semester("s1", "2026.2");
  await semester("s2", "2026.2 outro");
  await db
    .insert(schema.spaces)
    .values({ id: "sp", name: "Lab 1", capacity: null, createdAt: "t" });
  const batch = (id: string, semesterId: string, status: "aplicado" | "rascunho") =>
    db.insert(schema.importBatches).values({
      id,
      semesterId,
      fileHash: id,
      summaryJson: "{}",
      planHash: null,
      status,
      createdBy: "admin",
      createdAt: "t",
      appliedAt: status === "aplicado" ? "t" : null,
      supersedesBatchId: null,
    });
  await batch("b1", "s1", "aplicado");
  await batch("b2", "s2", "aplicado");
  await batch("b3", "s1", "rascunho");
  const occupation = (id: string, over: Partial<Occupation>) =>
    db.insert(schema.occupations).values({
      id,
      spaceId: "sp",
      startsAt: "2026-08-03T08:00",
      endsAt: "2026-08-03T08:50",
      source: "import",
      batchId: "b1",
      lessonId: "L1",
      responsibleUserId: null,
      title: "Algoritmos",
      status: "ativa",
      createdAt: "t",
      ...over,
    });
  const responsibles = async () =>
    Object.fromEntries(
      (
        await db
          .select({
            id: schema.occupations.id,
            responsibleUserId: schema.occupations.responsibleUserId,
          })
          .from(schema.occupations)
          .orderBy(asc(schema.occupations.id))
      ).map((row) => [row.id, row.responsibleUserId]),
    );
  return { repo: createImportRepository(db), occupation, responsibles };
}

describe("setResponsibles", () => {
  let env: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    env = await setup();
  });

  test("define o responsável de cada ocupação importada ativa do semestre, aula por aula", async () => {
    await env.occupation("o1", {});
    await env.occupation("o2", {
      startsAt: "2026-08-10T08:00",
      endsAt: "2026-08-10T08:50",
      responsibleUserId: "u2",
    });
    await env.occupation("o3", { lessonId: "L2", responsibleUserId: "u1" });
    await env.occupation("o4", { lessonId: "L3", responsibleUserId: "u2" });

    const changed = await env.repo.setResponsibles(
      "s1",
      FROM,
      TO,
      new Map([
        ["L1", "u1"],
        ["L2", null],
      ]),
    );

    expect(changed).toBe(3);
    expect(await env.responsibles()).toEqual({ o1: "u1", o2: "u1", o3: null, o4: "u2" });
  });

  test("avulsa e cancelada ficam intocadas", async () => {
    await env.occupation("avulsa", {
      source: "manual",
      batchId: null,
      responsibleUserId: "u2",
      createdBy: "u2",
    });
    await env.occupation("cancelada", {
      startsAt: "2026-08-10T08:00",
      endsAt: "2026-08-10T08:50",
      status: "cancelada",
      cancelReason: "outro",
      cancelledAt: "t",
    });

    const changed = await env.repo.setResponsibles("s1", FROM, TO, new Map([["L1", "u1"]]));

    expect(changed).toBe(0);
    expect(await env.responsibles()).toEqual({ avulsa: "u2", cancelada: null });
  });

  test("fora do semestre, de outro semestre ou de lote não aplicado fica intocada", async () => {
    await env.occupation("antes", { startsAt: "2026-08-02T08:00", endsAt: "2026-08-02T08:50" });
    await env.occupation("depois", { startsAt: "2026-08-24T08:00", endsAt: "2026-08-24T08:50" });
    await env.occupation("outro-semestre", { batchId: "b2" });
    await env.occupation("rascunho", { batchId: "b3" });
    await env.occupation("dentro", { startsAt: "2026-08-23T22:00", endsAt: "2026-08-23T22:50" });

    const changed = await env.repo.setResponsibles("s1", FROM, TO, new Map([["L1", "u1"]]));

    expect(changed).toBe(1);
    expect(await env.responsibles()).toEqual({
      antes: null,
      depois: null,
      dentro: "u1",
      "outro-semestre": null,
      rascunho: null,
    });
  });

  test("repetir não muda nada", async () => {
    await env.occupation("o1", {});
    await env.occupation("o2", { lessonId: "L2", responsibleUserId: "u1" });
    const map = new Map<string, string | null>([
      ["L1", "u2"],
      ["L2", null],
    ]);

    expect(await env.repo.setResponsibles("s1", FROM, TO, map)).toBe(2);
    const after = await env.responsibles();
    expect(await env.repo.setResponsibles("s1", FROM, TO, map)).toBe(0);
    expect(await env.responsibles()).toEqual(after);
    expect(after).toEqual({ o1: "u2", o2: null });
  });

  test("mais de um bloco de aulas: todas são atualizadas", async () => {
    const map = new Map<string, string | null>();
    for (let index = 0; index < 120; index++) {
      const id = `o${String(index).padStart(3, "0")}`;
      await env.occupation(id, { lessonId: `L${index}` });
      map.set(`L${index}`, "u1");
    }

    expect(await env.repo.setResponsibles("s1", FROM, TO, map)).toBe(120);
    expect(new Set(Object.values(await env.responsibles()))).toEqual(new Set(["u1"]));
  });

  test("um bloco que falha não grava nada dele", async () => {
    await env.occupation("o1", {});
    await env.occupation("o2", { lessonId: "L2" });

    await expect(
      env.repo.setResponsibles(
        "s1",
        FROM,
        TO,
        new Map([
          ["L1", "u1"],
          ["L2", "conta-inexistente"],
        ]),
      ),
    ).rejects.toThrow();
    expect(await env.responsibles()).toEqual({ o1: null, o2: null });
  });
});
