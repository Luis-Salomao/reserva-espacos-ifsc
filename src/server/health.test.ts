import { afterAll, beforeEach, expect, test } from "bun:test";
import { resetDbCache } from "#/infra/db/client.local";
import { getHealth } from "#/server/health";

const previous = { ...process.env };

beforeEach(() => {
  resetDbCache();
  process.env.DEPLOY_TARGET = "local";
  process.env.DATABASE_PATH = ":memory:";
  delete process.env.MIGRATIONS_DIR;
});

afterAll(() => {
  process.env = previous;
  resetDbCache();
});

test("devolve alvo local e zero espaços num banco novo", async () => {
  expect(await getHealth()).toEqual({ ok: true, target: "local", spaces: 0 });
});
