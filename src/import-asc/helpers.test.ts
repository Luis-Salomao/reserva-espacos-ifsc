import { describe, expect, test } from "bun:test";
import { idList, parseTime } from "./helpers.ts";

describe("idList", () => {
  test("normaliza espaços e vírgulas extras", () => {
    expect(idList("A, B,")).toEqual(["A", "B"]);
    expect(idList(undefined)).toEqual([]);
  });

  test("remove ids repetidos mantendo a ordem da primeira ocorrência", () => {
    expect(idList("R1, R2, R1,R2")).toEqual(["R1", "R2"]);
  });
});

describe("parseTime", () => {
  test("aceita segundos opcionais e descarta", () => {
    expect(parseTime("08:00:00")).toBe("08:00");
    expect(parseTime("8:05:30")).toBe("08:05");
    expect(parseTime("08:00:61")).toBeNull();
    expect(parseTime("08:00:")).toBeNull();
  });
});
