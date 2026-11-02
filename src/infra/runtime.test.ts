import { describe, expect, test } from "bun:test";
import { cryptoRandom, systemClock } from "#/infra/runtime";

describe("systemClock", () => {
  test("devolve a hora atual a cada chamada", () => {
    const before = Date.now();
    const now = systemClock.now().getTime();
    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(Date.now());
    expect(systemClock.now()).not.toBe(systemClock.now());
  });
});

describe("cryptoRandom", () => {
  test("devolve o tamanho pedido e valores distintos", () => {
    const a = cryptoRandom.bytes(32);
    const b = cryptoRandom.bytes(32);
    expect(a).toBeInstanceOf(Uint8Array);
    expect(a).toHaveLength(32);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
    expect(cryptoRandom.bytes(0)).toHaveLength(0);
  });

  test("usa crypto.getRandomValues, nunca Math.random", () => {
    const original = Math.random;
    Math.random = () => {
      throw new Error("Math.random proibido");
    };
    try {
      expect(cryptoRandom.bytes(16)).toHaveLength(16);
    } finally {
      Math.random = original;
    }
  });
});
