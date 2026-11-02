import { Database } from "bun:sqlite";
import { beforeEach, describe, expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { SpaceRepository } from "#/application/ports";
import { createSpaceRepository } from "#/infra/db/repos/space-repository";
import * as schema from "#/infra/db/schema";

describe("SpaceRepository", () => {
  let repo: SpaceRepository;

  beforeEach(() => {
    const db = drizzle(new Database(":memory:"), { schema });
    migrate(db, { migrationsFolder: "drizzle" });
    repo = createSpaceRepository(db);
  });

  test("cria e lista espaço com capacidade não informada", async () => {
    const created = await repo.create({ name: "Lab 1", capacity: null });
    const all = await repo.list();
    expect(all).toHaveLength(1);
    expect(all[0]?.capacity).toBeNull();
    expect(all[0]).toEqual(created);
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  test("persiste capacidade informada", async () => {
    const created = await repo.create({ name: "Auditório", capacity: 80 });
    expect(created.capacity).toBe(80);
  });

  test("rejeita nome duplicado", async () => {
    await repo.create({ name: "Lab 1", capacity: null });
    await expect(repo.create({ name: "Lab 1", capacity: 10 })).rejects.toThrow();
  });

  test("atualiza nome e capacidade; retorna nulo se não existe; nome duplicado falha", async () => {
    const lab = await repo.create({ name: "Lab 1", capacity: 10 });
    await repo.create({ name: "Lab 2", capacity: null });
    expect(await repo.update(lab.id, { name: "Laboratório", capacity: null })).toEqual({
      id: lab.id,
      name: "Laboratório",
      capacity: null,
    });
    expect((await repo.list()).map((s) => s.name)).toEqual(["Lab 2", "Laboratório"]);
    expect(await repo.update("nao-existe", { name: "X", capacity: 1 })).toBeNull();
    await expect(repo.update(lab.id, { name: "Lab 2", capacity: 1 })).rejects.toThrow();
  });
});
