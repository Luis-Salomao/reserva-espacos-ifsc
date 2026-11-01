import { describe, expect, test } from "bun:test";
import { idList } from "./helpers.ts";

describe("idList", () => {
  test("normaliza espaços e vírgulas extras", () => {
    expect(idList("A, B,")).toEqual(["A", "B"]);
    expect(idList(undefined)).toEqual([]);
  });

  test("remove ids repetidos mantendo a ordem da primeira ocorrência", () => {
    expect(idList("R1, R2, R1,R2")).toEqual(["R1", "R2"]);
  });
});
