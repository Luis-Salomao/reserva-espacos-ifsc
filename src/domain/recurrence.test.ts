import { describe, expect, test } from "bun:test";
import {
  expandRecurrence,
  MAX_OCCURRENCES,
  type Recurrence,
  recurrenceLabel,
  recurrenceSummary,
  weekOfMonth,
} from "./recurrence";

const rule = (over: Partial<Recurrence>): Recurrence => ({
  freq: "weekly",
  interval: 1,
  weekdays: [],
  end: { kind: "count", count: 3 },
  ...over,
});

function datesOf(start: string, over: Partial<Recurrence>): string[] {
  const result = expandRecurrence(start, rule(over));
  if (!result.ok) throw new Error(result.message);
  return result.dates;
}

function issueOf(start: string, over: Partial<Recurrence>): string {
  const result = expandRecurrence(start, rule(over));
  if (result.ok) throw new Error(`esperava recusa, veio ${result.dates.join(",")}`);
  return result.message;
}

describe("expandRecurrence: regras", () => {
  test("dia útil pula sábado e domingo", () => {
    expect(datesOf("2026-11-06", { freq: "workdays" })).toEqual([
      "2026-11-06",
      "2026-11-09",
      "2026-11-10",
    ]);
  });

  test("semanal com dias marcados, até a data (inclusive)", () => {
    expect(
      datesOf("2026-11-03", { weekdays: [1, 3], end: { kind: "until", date: "2026-11-12" } }),
    ).toEqual(["2026-11-03", "2026-11-05", "2026-11-10", "2026-11-12"]);
  });

  test("data inicial fora da regra: a série começa na primeira data que casa", () => {
    expect(datesOf("2026-11-02", { weekdays: [1], end: { kind: "count", count: 2 } })).toEqual([
      "2026-11-03",
      "2026-11-10",
    ]);
  });

  test("a cada 2 semanas, contadas da semana da data inicial", () => {
    expect(
      datesOf("2026-11-04", { weekdays: [0, 2], interval: 2, end: { kind: "count", count: 4 } }),
    ).toEqual(["2026-11-04", "2026-11-16", "2026-11-18", "2026-11-30"]);
  });

  test("semanal atravessa a virada do ano", () => {
    expect(datesOf("2026-12-24", { weekdays: [3] })).toEqual([
      "2026-12-24",
      "2026-12-31",
      "2027-01-07",
    ]);
  });

  test("mensal no dia 31 pula meses sem dia 31", () => {
    expect(datesOf("2027-01-31", { freq: "monthly-day" })).toEqual([
      "2027-01-31",
      "2027-03-31",
      "2027-05-31",
    ]);
  });

  test("mensal na 2ª terça atravessa a virada de mês e de ano", () => {
    expect(datesOf("2026-11-10", { freq: "monthly-weekday" })).toEqual([
      "2026-11-10",
      "2026-12-08",
      "2027-01-12",
    ]);
  });

  test("mensal na 5ª sexta pula meses sem 5ª sexta", () => {
    expect(
      datesOf("2026-10-30", { freq: "monthly-weekday", end: { kind: "count", count: 2 } }),
    ).toEqual(["2026-10-30", "2027-01-29"]);
  });

  test("mensal até a data inclui a data final", () => {
    expect(
      datesOf("2026-11-15", {
        freq: "monthly-day",
        end: { kind: "until", date: "2027-01-15" },
      }),
    ).toEqual(["2026-11-15", "2026-12-15", "2027-01-15"]);
  });

  test("término por contagem gera exatamente N datas", () => {
    expect(
      datesOf("2026-11-03", { freq: "workdays", end: { kind: "count", count: 7 } }),
    ).toHaveLength(7);
    expect(
      datesOf("2026-11-03", { freq: "workdays", end: { kind: "count", count: MAX_OCCURRENCES } }),
    ).toHaveLength(MAX_OCCURRENCES);
  });
});

describe("expandRecurrence: limites e recusas", () => {
  test("mais de 120 datas é recusado", () => {
    expect(
      issueOf("2026-11-03", { freq: "workdays", end: { kind: "until", date: "2027-11-03" } }),
    ).toBe("A série pode ter no máximo 120 datas.");
    expect(issueOf("2026-11-03", { freq: "workdays", end: { kind: "count", count: 121 } })).toBe(
      "O número de ocorrências deve ser de 1 a 120.",
    );
    expect(issueOf("2026-11-03", { freq: "workdays", end: { kind: "count", count: 0 } })).toBe(
      "O número de ocorrências deve ser de 1 a 120.",
    );
  });

  test("até 365 dias depois da data inicial: o dia 365 entra, o seguinte não", () => {
    expect(
      datesOf("2026-11-15", { freq: "monthly-day", end: { kind: "count", count: 13 } }).at(-1),
    ).toBe("2027-11-15");
    expect(issueOf("2026-11-15", { freq: "monthly-day", end: { kind: "count", count: 14 } })).toBe(
      "A série pode ir até 365 dias depois da data inicial.",
    );
    expect(
      issueOf("2026-11-15", { freq: "monthly-day", end: { kind: "until", date: "2027-11-16" } }),
    ).toBe("A série pode ir até 365 dias depois da data inicial.");
  });

  test("data final inválida ou antes da inicial", () => {
    expect(
      issueOf("2026-11-03", { weekdays: [1], end: { kind: "until", date: "2026-02-30" } }),
    ).toBe("Informe uma data final válida.");
    expect(
      issueOf("2026-11-03", { weekdays: [1], end: { kind: "until", date: "2026-11-02" } }),
    ).toBe("A data final deve ser igual ou posterior à data inicial.");
  });

  test("semanal exige dia marcado e intervalo de 1 a 12", () => {
    expect(issueOf("2026-11-03", { weekdays: [] })).toBe("Marque ao menos um dia da semana.");
    expect(issueOf("2026-11-03", { weekdays: [7] })).toBe("Marque ao menos um dia da semana.");
    expect(issueOf("2026-11-03", { weekdays: [1], interval: 0 })).toBe(
      "O intervalo deve ser de 1 a 12 semanas.",
    );
    expect(issueOf("2026-11-03", { weekdays: [1], interval: 13 })).toBe(
      "O intervalo deve ser de 1 a 12 semanas.",
    );
    expect(
      datesOf("2026-11-03", { weekdays: [1], interval: 12, end: { kind: "count", count: 2 } }),
    ).toEqual(["2026-11-03", "2027-01-26"]);
  });

  test("regra que não gera nenhuma data é recusada", () => {
    expect(
      issueOf("2026-11-03", { weekdays: [5], end: { kind: "until", date: "2026-11-05" } }),
    ).toBe("Nenhuma data corresponde à repetição.");
  });
});

describe("resumo", () => {
  test("semanal: 'Toda terça e quinta, até 17/12, 14 datas'", () => {
    const r = rule({ weekdays: [3, 1], end: { kind: "until", date: "2026-12-18" } });
    const result = expandRecurrence("2026-11-03", r);
    expect(result.ok && recurrenceSummary("2026-11-03", r, result.dates)).toBe(
      "Toda terça e quinta, até 17/12, 14 datas",
    );
  });

  test("ano aparece quando a última data muda de ano; singular com uma data", () => {
    const r = rule({ weekdays: [3] });
    expect(recurrenceSummary("2026-12-24", r, ["2026-12-24", "2026-12-31", "2027-01-07"])).toBe(
      "Toda quinta, até 07/01/2027, 3 datas",
    );
    expect(recurrenceSummary("2026-12-24", r, ["2026-12-24"])).toBe(
      "Toda quinta, até 24/12, 1 data",
    );
  });

  test("nomes das regras", () => {
    expect(recurrenceLabel("2026-11-03", rule({ freq: "workdays" }))).toBe(
      "Todo dia útil (seg. a sex.)",
    );
    expect(recurrenceLabel("2026-11-07", rule({ weekdays: [5, 6] }))).toBe("Todo sábado e domingo");
    expect(recurrenceLabel("2026-11-03", rule({ weekdays: [0, 2, 4] }))).toBe(
      "Toda segunda, quarta e sexta",
    );
    expect(recurrenceLabel("2026-11-03", rule({ weekdays: [1], interval: 2 }))).toBe(
      "A cada 2 semanas: terça",
    );
    expect(recurrenceLabel("2026-11-15", rule({ freq: "monthly-day" }))).toBe("Todo mês no dia 15");
    expect(recurrenceLabel("2026-11-10", rule({ freq: "monthly-weekday" }))).toBe(
      "Todo mês na 2ª terça",
    );
  });

  test("semana do mês", () => {
    expect(
      [1, 7, 8, 28, 29, 31].map((d) => weekOfMonth(`2026-12-${String(d).padStart(2, "0")}`)),
    ).toEqual([1, 1, 2, 4, 5, 5]);
  });
});
