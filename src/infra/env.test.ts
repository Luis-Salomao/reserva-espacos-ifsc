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

describe("getEnv: senha", () => {
  const base = { DEPLOY_TARGET: "cloudflare" };

  test("padrões: scrypt, N=16384, sem pepper", () => {
    const env = getEnv(base);
    expect(env.PASSWORD_HASH).toBe("scrypt");
    expect(env.PASSWORD_SCRYPT_N).toBe(16384);
    expect(env.PASSWORD_PEPPER).toBeUndefined();
  });

  test("COOKIE_SECURE: padrão auto; aceita true/false; rejeita outro valor", () => {
    expect(getEnv(base).COOKIE_SECURE).toBe("auto");
    expect(getEnv({ ...base, COOKIE_SECURE: "true" }).COOKIE_SECURE).toBe("true");
    expect(getEnv({ ...base, COOKIE_SECURE: "false" }).COOKIE_SECURE).toBe("false");
    expect(() => getEnv({ ...base, COOKIE_SECURE: "talvez" })).toThrow("COOKIE_SECURE");
  });

  test("lê pbkdf2, N e pepper", () => {
    const env = getEnv({
      ...base,
      PASSWORD_HASH: "pbkdf2",
      PASSWORD_SCRYPT_N: "32768",
      PASSWORD_PEPPER: "pepper-de-teste",
    });
    expect(env.PASSWORD_HASH).toBe("pbkdf2");
    expect(env.PASSWORD_SCRYPT_N).toBe(32768);
    expect(env.PASSWORD_PEPPER).toBe("pepper-de-teste");
  });

  test("rejeita algoritmo desconhecido e N inválido", () => {
    expect(() => getEnv({ ...base, PASSWORD_HASH: "md5" })).toThrow("PASSWORD_HASH");
    expect(() => getEnv({ ...base, PASSWORD_SCRYPT_N: "1000" })).toThrow("PASSWORD_SCRYPT_N");
    expect(() => getEnv({ ...base, PASSWORD_SCRYPT_N: "512" })).toThrow("PASSWORD_SCRYPT_N");
  });
});
