import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getDb, getRuntimeEnv, resetDbCache } from "#/infra/db/client.local";
import { createSpaceRepository } from "#/infra/db/repos/space-repository";

describe("getDb (local)", () => {
  const previous = { ...process.env };
  const tmp = mkdtempSync(join(tmpdir(), "reserva-db-"));

  beforeEach(() => {
    resetDbCache();
    process.env.DEPLOY_TARGET = "local";
    process.env.DATABASE_PATH = ":memory:";
    delete process.env.MIGRATIONS_DIR;
  });

  afterAll(() => {
    process.env = previous;
    resetDbCache();
    rmSync(tmp, { recursive: true, force: true });
  });

  test("migra no primeiro uso e reutiliza a conexão", async () => {
    const db = getDb();
    expect(getDb()).toBe(db);
    const repo = createSpaceRepository(db);
    await repo.create({ name: "Sala 1", capacity: 20 });
    expect(await repo.list()).toHaveLength(1);
  });

  test("cria a pasta pai do arquivo ainda inexistente", () => {
    const file = join(tmp, "novo", "sub", "app.sqlite");
    process.env.DATABASE_PATH = file;
    getDb();
    expect(existsSync(file)).toBe(true);
  });

  test("respeita MIGRATIONS_DIR", () => {
    process.env.MIGRATIONS_DIR = join(tmp, "inexistente");
    expect(() => getDb()).toThrow();
  });
});

describe("getDb sem DATABASE_PATH", () => {
  const previous = { ...process.env };
  afterAll(() => {
    process.env = previous;
    resetDbCache();
  });

  test("em desenvolvimento usa ./data/dev.sqlite e cria data/", () => {
    resetDbCache();
    const cwd = process.cwd();
    const dir = mkdtempSync(join(tmpdir(), "dev-default-"));
    process.chdir(dir);
    try {
      process.env.DEPLOY_TARGET = "local";
      process.env.NODE_ENV = "development";
      Reflect.deleteProperty(process.env, "DATABASE_PATH");
      getDb();
      expect(existsSync(join(dir, "data", "dev.sqlite"))).toBe(true);
    } finally {
      resetDbCache();
      process.chdir(cwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("em produção falha nomeando a variável", () => {
    resetDbCache();
    process.env.DEPLOY_TARGET = "local";
    process.env.NODE_ENV = "production";
    Reflect.deleteProperty(process.env, "DATABASE_PATH");
    expect(() => getDb()).toThrow("DATABASE_PATH");
  });
});

describe("getRuntimeEnv (local)", () => {
  const previous = { ...process.env };
  afterAll(() => {
    process.env = previous;
  });

  test("assume DEPLOY_TARGET=local quando ausente, mas não inventa DATABASE_PATH", () => {
    Reflect.deleteProperty(process.env, "DEPLOY_TARGET");
    Reflect.deleteProperty(process.env, "DATABASE_PATH");
    const env = getRuntimeEnv();
    expect(env.DEPLOY_TARGET).toBe("local");
    expect(env.DATABASE_PATH).toBeUndefined();
  });

  test("respeita valores definidos", () => {
    process.env.DEPLOY_TARGET = "local";
    process.env.DATABASE_PATH = "/x/app.sqlite";
    expect(getRuntimeEnv().DATABASE_PATH).toBe("/x/app.sqlite");
  });
});
