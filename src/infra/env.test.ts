import { describe, expect, test } from "bun:test";
import { getEnv } from "#/infra/env";

describe("getEnv", () => {
  test("aplica padrões de fuso e leitura pública", () => {
    const env = getEnv({ DEPLOY_TARGET: "local", DATABASE_PATH: "x.sqlite" });
    expect(env.TIMEZONE).toBe("America/Sao_Paulo");
    expect(env.PUBLIC_READ).toBe(true);
    expect(env.DATABASE_PATH).toBe("x.sqlite");
  });

  test("exige DATABASE_PATH no alvo local", () => {
    expect(() => getEnv({ DEPLOY_TARGET: "local" })).toThrow("DATABASE_PATH");
  });

  test("aceita cloudflare sem DATABASE_PATH e lê PUBLIC_READ=false", () => {
    const env = getEnv({ DEPLOY_TARGET: "cloudflare", PUBLIC_READ: "false" });
    expect(env.DEPLOY_TARGET).toBe("cloudflare");
    expect(env.PUBLIC_READ).toBe(false);
  });

  test("não vaza valores na mensagem de erro", () => {
    let message = "";
    try {
      getEnv({ DEPLOY_TARGET: "s3cr3t" });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("DEPLOY_TARGET");
    expect(message).not.toContain("s3cr3t");
  });
});
