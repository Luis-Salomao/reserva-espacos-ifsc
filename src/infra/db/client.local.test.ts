import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { getDb } from "#/infra/db/client.local";
import { createSpaceRepository } from "#/infra/db/repos/space-repository";

describe("getDb (local)", () => {
  const previous = { ...process.env };

  beforeAll(() => {
    process.env.DEPLOY_TARGET = "local";
    process.env.DATABASE_PATH = ":memory:";
  });

  afterAll(() => {
    process.env = previous;
  });

  test("migra no primeiro uso e reutiliza a conexão", async () => {
    const db = getDb();
    expect(getDb()).toBe(db);
    const repo = createSpaceRepository(db);
    await repo.create({ name: "Sala 1", capacity: 20 });
    expect(await repo.list()).toHaveLength(1);
  });
});
