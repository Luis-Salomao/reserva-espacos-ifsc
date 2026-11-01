import { describe, expect, test } from "bun:test";
import { checkContentLength, readBodyWithLimit } from "./upload-limit.ts";

const h = (value?: string) => new Headers(value === undefined ? {} : { "content-length": value });

describe("checkContentLength", () => {
  test("aceita até o limite", () => {
    expect(checkContentLength(h("100"), 100)).toEqual({ ok: true });
  });
  test("413 acima do limite", () => {
    expect(checkContentLength(h("101"), 100)).toMatchObject({ ok: false, status: 413 });
  });
  test("411 quando ausente ou inválido", () => {
    for (const value of [undefined, "abc", "-1", "1e3"]) {
      expect(checkContentLength(h(value), 100)).toMatchObject({ ok: false, status: 411 });
    }
  });
});

describe("readBodyWithLimit", () => {
  test("junta os pedaços", async () => {
    const bytes = await readBodyWithLimit(new Response("abcdef").body, 10);
    expect(new TextDecoder().decode(bytes ?? new Uint8Array())).toBe("abcdef");
  });
  test("corpo nulo vira vazio", async () => {
    expect((await readBodyWithLimit(null, 10))?.byteLength).toBe(0);
  });
  test("devolve null e cancela ao passar do limite", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(8));
      },
      cancel() {
        cancelled = true;
      },
    });
    expect(await readBodyWithLimit(body, 20)).toBeNull();
    expect(cancelled).toBe(true);
  });
});
