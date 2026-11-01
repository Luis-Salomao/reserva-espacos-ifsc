import { afterAll, beforeEach, expect, spyOn, test } from "bun:test";
import { resetDbCache } from "#/infra/db/client.local";
import { getHealth, healthStatus } from "#/server/health";

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

test("devolve ok:false sem detalhes quando a configuração é inválida", async () => {
  process.env.DEPLOY_TARGET = "invalido";
  const spy = spyOn(console, "error").mockImplementation(() => {});
  try {
    expect(await getHealth()).toEqual({ ok: false });
  } finally {
    spy.mockRestore();
  }
});

test("registra o motivo da falha no log do servidor, sem vazá-lo na resposta", async () => {
  process.env.DEPLOY_TARGET = "invalido";
  const spy = spyOn(console, "error").mockImplementation(() => {});
  try {
    expect(await getHealth()).toEqual({ ok: false });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(String(spy.mock.calls[0]?.[0])).toContain("[health] falha:");
    expect(String(spy.mock.calls[0]?.[1])).toContain("DEPLOY_TARGET");
  } finally {
    spy.mockRestore();
  }
});

test("healthStatus mapeia ok para 200 e falha para 503", () => {
  expect(healthStatus({ ok: true, target: "local", spaces: 0 })).toBe(200);
  expect(healthStatus({ ok: false })).toBe(503);
});
