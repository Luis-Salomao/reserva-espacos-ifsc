import { describe, expect, test } from "bun:test";
import { createNonce, currentNonce, runWithNonce } from "./request-nonce.ts";

describe("createNonce", () => {
  test("base64 de 16 bytes, diferente a cada chamada", () => {
    const first = createNonce();
    expect(first).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(createNonce()).not.toBe(first);
  });
});

describe("runWithNonce / currentNonce", () => {
  test("fora de uma requisição não há nonce", () => {
    expect(currentNonce()).toBeUndefined();
  });

  test("o nonce acompanha o código assíncrono e não vaza entre requisições", async () => {
    const seen = await Promise.all(
      ["a", "b"].map((nonce) =>
        runWithNonce(nonce, async () => {
          await Promise.resolve();
          await new Promise((resolve) => setTimeout(resolve, nonce === "a" ? 5 : 1));
          return currentNonce();
        }),
      ),
    );
    expect(seen).toEqual(["a", "b"]);
    expect(currentNonce()).toBeUndefined();
  });
});
