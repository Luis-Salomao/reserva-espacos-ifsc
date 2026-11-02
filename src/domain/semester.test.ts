import { describe, expect, test } from "bun:test";
import {
  blocksFromPeriods,
  isValidDate,
  isValidTime,
  type Semester,
  validateSemester,
  validateSemesterIssues,
} from "./semester";

const base: Semester = {
  id: "s1",
  name: "2026.2",
  start: "2026-08-03",
  end: "2026-12-19",
  terms: [
    { position: 1, start: "2026-08-03", end: "2026-10-03" },
    { position: 2, start: "2026-10-05", end: "2026-12-19" },
  ],
  blocks: [
    { number: 1, name: "Noite 12", short: "N12", start: "18:00", end: "19:50" },
    { number: 2, name: "Noite 123", short: "N123", start: "19:00", end: "22:00" },
  ],
};

const fields = (s: Semester) => validateSemesterIssues(s).map((issue) => issue.field);

describe("isValidDate", () => {
  test.each([
    ["2026-01-01", true],
    ["2026-12-31", true],
    ["2026-04-30", true],
    ["2026-04-31", false],
    ["2026-02-28", true],
    ["2026-02-29", false],
    ["2026-02-30", false],
    ["2028-02-29", true],
    ["2100-02-29", false],
    ["2000-02-29", true],
    ["2026-00-10", false],
    ["2026-13-10", false],
    ["2026-01-00", false],
    ["2026-01-32", false],
    ["1999-12-31", false],
    ["2101-01-01", false],
    ["2026-1-01", false],
    ["26-01-01", false],
    ["2026/01/01", false],
    [" 2026-01-01", false],
    ["", false],
  ])("%s -> %p", (value, expected) => {
    expect(isValidDate(value)).toBe(expected);
  });
});

describe("isValidTime", () => {
  test.each([
    ["00:00", true],
    ["23:59", true],
    ["24:00", false],
    ["12:60", false],
    ["8:00", false],
    ["08:0", false],
    ["08:00:00", false],
    ["", false],
  ])("%s -> %p", (value, expected) => {
    expect(isValidTime(value)).toBe(expected);
  });
});

describe("validateSemester", () => {
  test("semestre válido, com durações e blocos sobrepostos permitidos", () => {
    const overlapping = {
      ...base,
      terms: [
        { position: 1, start: "2026-08-03", end: "2026-10-10" },
        { position: 2, start: "2026-10-01", end: "2026-12-19" },
      ],
    };
    expect(validateSemester(overlapping)).toEqual([]);
    expect(validateSemester({ ...base, terms: [], blocks: [] })).toEqual([]);
  });

  test("fim deve ser posterior ao início (igual também é recusado)", () => {
    expect(fields({ ...base, end: "2026-08-03", terms: [] })).toEqual(["end"]);
    expect(fields({ ...base, end: "2026-08-02", terms: [] })).toEqual(["end"]);
    expect(fields({ ...base, end: "2026-08-04", terms: [] })).toEqual([]);
  });

  test("datas impossíveis ou mal formadas", () => {
    expect(fields({ ...base, start: "2026-02-30", terms: [] })).toEqual(["start"]);
    expect(fields({ ...base, end: "2026-13-01", terms: [] })).toEqual(["end"]);
    expect(validateSemester({ ...base, start: "x", end: "y", terms: [] })).toEqual([
      "Data de início inválida.",
      "Data de fim inválida.",
    ]);
  });

  test("durações: limites exatos dentro da vigência são aceitos", () => {
    const edges = { ...base, terms: [{ position: 4, start: base.start, end: base.end }] };
    expect(validateSemester(edges)).toEqual([]);
  });

  test("durações fora da vigência", () => {
    const before = { ...base, terms: [{ position: 1, start: "2026-08-02", end: "2026-09-01" }] };
    expect(fields(before)).toEqual(["term-1-start"]);
    const after = { ...base, terms: [{ position: 3, start: "2026-09-01", end: "2026-12-20" }] };
    expect(fields(after)).toEqual(["term-3-end"]);
    const startAfterEnd = {
      ...base,
      terms: [{ position: 1, start: "2026-12-20", end: "2026-12-21" }],
    };
    expect(fields(startAfterEnd)).toEqual(["term-1-start", "term-1-end"]);
    const endBeforeStart = {
      ...base,
      terms: [{ position: 1, start: "2026-08-02", end: "2026-08-01" }],
    };
    expect(fields(endBeforeStart)).toEqual(["term-1-end", "term-1-start", "term-1-end"]);
  });

  test("duração com fim anterior ao início", () => {
    const t = { ...base, terms: [{ position: 1, start: "2026-09-10", end: "2026-09-09" }] };
    expect(fields(t)).toEqual(["term-1-end"]);
    const same = { ...base, terms: [{ position: 1, start: "2026-09-10", end: "2026-09-10" }] };
    expect(validateSemester(same)).toEqual([]);
  });

  test("duração com data impossível", () => {
    const t = { ...base, terms: [{ position: 2, start: "2026-02-30", end: "2026-13-01" }] };
    expect(fields(t)).toEqual(["term-2-start", "term-2-end"]);
  });

  test("duração fora de 1..4 ou repetida", () => {
    for (const position of [0, 5, -1, 1.5]) {
      const t = { ...base, terms: [{ position, start: base.start, end: base.end }] };
      expect(fields(t)).toEqual(["terms"]);
    }
    const dup = {
      ...base,
      terms: [
        { position: 1, start: base.start, end: base.end },
        { position: 1, start: base.start, end: base.end },
      ],
    };
    expect(fields(dup)).toEqual(["term-1-start"]);
  });

  test("com a vigência inválida, não compara as durações com ela", () => {
    const s = { ...base, start: "2026-02-30" };
    expect(fields(s)).toEqual(["start"]);
  });

  test("blocos: número repetido, não positivo ou fracionário", () => {
    const dup = {
      ...base,
      blocks: [
        { number: 1, name: "A", short: "A", start: "08:00", end: "09:00" },
        { number: 1, name: "B", short: "B", start: "09:00", end: "10:00" },
      ],
    };
    expect(fields(dup)).toEqual(["block-1-number"]);
    for (const number of [0, -3, 2.5]) {
      const b = {
        ...base,
        blocks: [{ number, name: "A", short: "A", start: "08:00", end: "09:00" }],
      };
      expect(fields(b)).toEqual(["block-0-number"]);
    }
  });

  test("blocos: nome e sigla de 1 até o limite", () => {
    const mk = (name: string, short: string) => ({
      ...base,
      blocks: [{ number: 1, name, short, start: "08:00", end: "09:00" }],
    });
    expect(validateSemester(mk("n".repeat(40), "s".repeat(10)))).toEqual([]);
    expect(fields(mk("", "S"))).toEqual(["block-0-name"]);
    expect(fields(mk("n".repeat(41), "S"))).toEqual(["block-0-name"]);
    expect(fields(mk("N", ""))).toEqual(["block-0-short"]);
    expect(fields(mk("N", "s".repeat(11)))).toEqual(["block-0-short"]);
  });

  test("blocos: fim deve ser posterior ao início", () => {
    const mk = (start: string, end: string) => ({
      ...base,
      blocks: [{ number: 1, name: "A", short: "A", start, end }],
    });
    expect(fields(mk("08:00", "08:00"))).toEqual(["block-0-end"]);
    expect(fields(mk("09:00", "08:00"))).toEqual(["block-0-end"]);
    expect(fields(mk("08:00", "08:01"))).toEqual([]);
    expect(fields(mk("25:00", "26:00"))).toEqual(["block-0-start", "block-0-end"]);
  });

  test("limite de blocos", () => {
    const blocks = Array.from({ length: 31 }, (_, i) => ({
      number: i + 1,
      name: "A",
      short: "A",
      start: "08:00",
      end: "09:00",
    }));
    expect(fields({ ...base, blocks })).toEqual(["blocks"]);
    expect(validateSemester({ ...base, blocks: blocks.slice(0, 30) })).toEqual([]);
  });
});

describe("blocksFromPeriods", () => {
  test("converte e corta rótulos longos", () => {
    const blocks = blocksFromPeriods([
      { number: 5, name: " Noite 12 ", short: "N12", start: "18:00", end: "19:50" },
      { number: 6, name: "x".repeat(60), short: "y".repeat(20), start: "20:10", end: "22:00" },
    ]);
    expect(blocks[0]).toEqual({
      number: 5,
      name: "Noite 12",
      short: "N12",
      start: "18:00",
      end: "19:50",
    });
    expect(blocks[1]?.name).toHaveLength(40);
    expect(blocks[1]?.short).toHaveLength(10);
  });
});
