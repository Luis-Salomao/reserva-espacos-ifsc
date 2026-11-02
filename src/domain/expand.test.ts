import { describe, expect, test } from "bun:test";
import { addDays, datesBetween, weekdayOf } from "./calendar";
import { type ExpandableSlot, expandSlotDates, missingTerms } from "./expand";
import type { Semester } from "./semester";

const slot = (over: Partial<ExpandableSlot> = {}): ExpandableSlot => ({
  weekday: 0,
  termsMask: null,
  segments: [{ period: 1, start: "08:00", end: "09:50" }],
  ...over,
});

const semester = (over: Partial<Semester> = {}): Semester => ({
  id: "s",
  name: "2026.2",
  start: "2026-08-03",
  end: "2026-08-23",
  terms: [],
  blocks: [],
  ...over,
});

describe("calendário puro", () => {
  test("dia da semana com segunda = 0", () => {
    expect(weekdayOf("2026-08-03")).toBe(0);
    expect(weekdayOf("2026-08-09")).toBe(6);
    expect(weekdayOf("2024-02-29")).toBe(3);
    expect(weekdayOf("2000-01-01")).toBe(5);
  });

  test("soma de dias atravessa mês, ano e dia bissexto", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDays("2024-02-29", 1)).toBe("2024-03-01");
    expect(addDays("2025-02-28", 1)).toBe("2025-03-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  test("intervalo inclusivo e vazio quando o fim é anterior", () => {
    expect(datesBetween("2026-12-30", "2027-01-02")).toEqual([
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
    ]);
    expect(datesBetween("2026-02-03", "2026-02-02")).toEqual([]);
  });
});

describe("expandSlotDates", () => {
  test("uma ocorrência por data no dia da semana, dentro da vigência", () => {
    const result = expandSlotDates(slot(), semester());
    expect(result.map((o) => o.date)).toEqual(["2026-08-03", "2026-08-10", "2026-08-17"]);
    expect(result[0]).toEqual({ date: "2026-08-03", start: "08:00", end: "09:50", period: 1 });
  });

  test("um segmento por ocorrência: o intervalo entre blocos fica livre", () => {
    const result = expandSlotDates(
      slot({
        segments: [
          { period: 1, start: "08:00", end: "09:50" },
          { period: 2, start: "10:10", end: "12:00" },
        ],
      }),
      semester({ end: "2026-08-09" }),
    );
    expect(result).toEqual([
      { date: "2026-08-03", start: "08:00", end: "09:50", period: 1 },
      { date: "2026-08-03", start: "10:10", end: "12:00", period: 2 },
    ]);
  });

  test("semana começa na segunda e a quinta cai em 2024-02-29 (bissexto)", () => {
    const result = expandSlotDates(
      slot({ weekday: 3 }),
      semester({ start: "2024-02-26", end: "2024-03-10" }),
    );
    expect(result.map((o) => o.date)).toEqual(["2024-02-29", "2024-03-07"]);
  });

  test("virada de ano", () => {
    const result = expandSlotDates(
      slot({ weekday: 3 }),
      semester({ start: "2026-12-20", end: "2027-01-10" }),
    );
    expect(result.map((o) => o.date)).toEqual(["2026-12-24", "2026-12-31", "2027-01-07"]);
  });

  test("termsMask restringe às durações marcadas (duração parcial)", () => {
    const sem = semester({
      end: "2026-10-31",
      terms: [
        { position: 1, start: "2026-08-03", end: "2026-08-16" },
        { position: 2, start: "2026-09-07", end: "2026-09-20" },
      ],
    });
    expect(expandSlotDates(slot({ termsMask: "0100" }), sem).map((o) => o.date)).toEqual([
      "2026-09-07",
      "2026-09-14",
    ]);
    expect(expandSlotDates(slot({ termsMask: "1100" }), sem).map((o) => o.date)).toEqual([
      "2026-08-03",
      "2026-08-10",
      "2026-09-07",
      "2026-09-14",
    ]);
  });

  test("termsMask nulo usa todas as durações configuradas", () => {
    const sem = semester({
      terms: [{ position: 2, start: "2026-08-10", end: "2026-08-16" }],
    });
    expect(expandSlotDates(slot(), sem).map((o) => o.date)).toEqual(["2026-08-10"]);
  });

  test("durações sobrepostas não duplicam datas", () => {
    const sem = semester({
      terms: [
        { position: 1, start: "2026-08-03", end: "2026-08-12" },
        { position: 2, start: "2026-08-10", end: "2026-08-17" },
      ],
    });
    expect(expandSlotDates(slot({ termsMask: "1100" }), sem).map((o) => o.date)).toEqual([
      "2026-08-03",
      "2026-08-10",
      "2026-08-17",
    ]);
  });

  test("sem durações configuradas e máscara nula, usa o semestre inteiro", () => {
    expect(expandSlotDates(slot(), semester())).toHaveLength(3);
  });

  test("duração marcada sem datas configuradas: nada é gerado e a falta é apontada", () => {
    const sem = semester({ terms: [{ position: 1, start: "2026-08-03", end: "2026-08-16" }] });
    expect(missingTerms(slot({ termsMask: "0010" }), sem)).toEqual([3]);
    expect(expandSlotDates(slot({ termsMask: "0010" }), sem)).toEqual([]);
    expect(missingTerms(slot({ termsMask: "1010" }), sem)).toEqual([3]);
    expect(expandSlotDates(slot({ termsMask: "1010" }), sem)).toEqual([]);
    expect(missingTerms(slot({ termsMask: "1000" }), sem)).toEqual([]);
    expect(missingTerms(slot({ termsMask: null }), semester())).toEqual([]);
    expect(missingTerms(slot({ termsMask: "1000" }), semester())).toEqual([1]);
  });

  test("recorta pela vigência do semestre", () => {
    const sem = semester({
      end: "2026-08-12",
      terms: [{ position: 1, start: "2026-08-01", end: "2026-09-30" }],
    });
    expect(expandSlotDates(slot(), sem).map((o) => o.date)).toEqual(["2026-08-03", "2026-08-10"]);
  });
});
