import { describe, expect, test } from "bun:test";
import { boundedInt, IMPORT_ROW_STATUSES, passthrough } from "./input.ts";

describe("entrada das server functions", () => {
  test("passthrough devolve o dado como veio", () => {
    const data = { a: 1 };
    expect(passthrough(data)).toBe(data);
  });

  test("boundedInt: ausente, válido e inválido", () => {
    expect(boundedInt(undefined, 1, 10)).toBeUndefined();
    expect(boundedInt(5, 1, 10)).toBe(5);
    for (const bad of [0, 11, 1.5, "3", null]) expect(boundedInt(bad, 1, 10)).toBeNull();
  });

  test("lista as treze situações de linha", () => {
    expect(IMPORT_ROW_STATUSES).toHaveLength(13);
  });
});
