import { describe, expect, test } from "bun:test";
import type { AscTimetable, Card, Lesson, Period } from "#/domain/timetable.ts";
import { normalizeAsc } from "./normalize.ts";
import { readAscXml } from "./read.ts";
import { buildWeeklySlots, masksOverlap } from "./slots.ts";

const P = (number: number, start: string, end: string): Period => ({
  number,
  name: String(number),
  short: String(number),
  start,
  end,
});
const REAL_PERIODS = [
  P(1, "08:00", "09:50"),
  P(2, "10:10", "12:00"),
  P(3, "13:30", "15:20"),
  P(4, "15:40", "17:30"),
  P(5, "18:00", "19:50"),
  P(6, "20:10", "22:00"),
  P(7, "19:00", "22:00"),
];

function lesson(id: string, extra: Partial<Lesson> = {}): Lesson {
  return {
    id,
    subjectId: null,
    classIds: [],
    teacherIds: [],
    classroomIds: [],
    periodsPerCard: 1,
    termsDefId: null,
    weeksDefId: null,
    daysDefId: null,
    ...extra,
  };
}
function card(lessonId: string, extra: Partial<Card> = {}): Card {
  return {
    lessonId,
    period: 1,
    days: "10000",
    weeks: null,
    terms: null,
    classroomIds: ["R1"],
    ...extra,
  };
}
function tt(lessons: Lesson[], cards: Card[], periods: Period[] = REAL_PERIODS): AscTimetable {
  return {
    periods,
    days: [],
    terms: [],
    weeks: [],
    classrooms: [],
    teachers: [],
    subjects: [],
    classes: [],
    lessons,
    cards,
  };
}

async function fromFixture(name: string) {
  const bytes = new Uint8Array(await Bun.file(`test/fixtures/asc/${name}`).arrayBuffer());
  const read = readAscXml(bytes);
  if (!read.ok) throw new Error("fixture inválida");
  return buildWeeklySlots(normalizeAsc(read.root).timetable);
}

describe("expansão de cards", () => {
  test("um slot por posição 1 da máscara de dias", () => {
    const { slots } = buildWeeklySlots(tt([lesson("L1")], [card("L1", { days: "01010" })]));
    expect(slots.map((s) => [s.weekday, s.start, s.end])).toEqual([
      [1, "08:00", "09:50"],
      [3, "08:00", "09:50"],
    ]);
  });

  test("máscara de dias de qualquer tamanho", () => {
    const { slots } = buildWeeklySlots(tt([lesson("L1")], [card("L1", { days: "0000001" })]));
    expect(slots.map((s) => s.weekday)).toEqual([6]);
  });

  test("periodspercard=2 a partir do período 5 ocupa 5 e 6, não 7", () => {
    const { slots } = buildWeeklySlots(
      tt([lesson("L1", { periodsPerCard: 2 })], [card("L1", { period: 5 })]),
    );
    expect(slots[0]).toMatchObject({ periodFrom: 5, periodTo: 6, start: "18:00", end: "22:00" });
  });

  test("ultrapassar o último período gera period_overflow sem slot", () => {
    const result = buildWeeklySlots(
      tt([lesson("L1", { periodsPerCard: 2 })], [card("L1", { period: 7 })]),
    );
    expect(result.slots).toEqual([]);
    expect(result.issues).toEqual([{ code: "period_overflow", ref: "L1" }]);
  });

  test("período inexistente ou nulo gera missing_period", () => {
    const result = buildWeeklySlots(
      tt([lesson("L1")], [card("L1", { period: 99 }), card("L1", { period: null })]),
    );
    expect(result.issues.map((i) => i.code)).toEqual(["missing_period", "missing_period"]);
  });

  test("dias nulos, inválidos ou sem 1 geram invalid_days, sem inferir da definição", () => {
    const result = buildWeeklySlots(
      tt(
        [lesson("L1", { daysDefId: "D1" })],
        [card("L1", { days: null }), card("L1", { days: "00000" }), card("L1", { days: "1a" })],
      ),
    );
    expect(result.slots).toEqual([]);
    expect(result.issues.map((i) => i.code)).toEqual([
      "invalid_days",
      "invalid_days",
      "invalid_days",
    ]);
  });

  test("períodos duplicados e com fim <= início são ignorados e reportados", () => {
    const periods = [P(1, "08:00", "09:00"), P(1, "10:00", "11:00"), P(2, "12:00", "12:00")];
    const result = buildWeeklySlots(
      tt([lesson("L1")], [card("L1", { period: 1 }), card("L1", { period: 2 })], periods),
    );
    expect(result.issues).toEqual([
      { code: "invalid_period", ref: "1" },
      { code: "invalid_period", ref: "2" },
      { code: "missing_period", ref: "L1" },
    ]);
    expect(result.slots).toHaveLength(1);
    expect(result.slots[0]?.start).toBe("08:00");
  });

  test("lesson sem card gera lesson_without_cards", () => {
    const result = buildWeeklySlots(tt([lesson("L1"), lesson("L2")], [card("L1")]));
    expect(result.issues).toEqual([{ code: "lesson_without_cards", ref: "L2" }]);
  });

  test("card de lesson inexistente é ignorado", () => {
    expect(buildWeeklySlots(tt([], [card("X")]))).toEqual({ slots: [], issues: [], overlaps: [] });
  });

  test("periodsPerCard 0 é tratado como 1", () => {
    const { slots } = buildWeeklySlots(tt([lesson("L1", { periodsPerCard: 0 })], [card("L1")]));
    expect(slots[0]?.periodTo).toBe(1);
  });
});

describe("status de sala", () => {
  test("herda da lesson quando o card não tem sala", () => {
    const { slots } = buildWeeklySlots(
      tt([lesson("L1", { classroomIds: ["R9"] })], [card("L1", { classroomIds: [] })]),
    );
    expect(slots[0]).toMatchObject({ classroomIds: ["R9"], status: "applicable" });
  });

  test("sem sala em ambos é no_room", () => {
    const { slots } = buildWeeklySlots(tt([lesson("L1")], [card("L1", { classroomIds: [] })]));
    expect(slots[0]?.status).toBe("no_room");
  });

  test("várias salas é multiple_rooms, sem escolher", () => {
    const { slots } = buildWeeklySlots(
      tt([lesson("L1")], [card("L1", { classroomIds: ["R1", "R2"] })]),
    );
    expect(slots[0]).toMatchObject({ status: "multiple_rooms", classroomIds: ["R1", "R2"] });
  });
});

describe("sobreposição interna", () => {
  const two = (a: Partial<Card>, b: Partial<Card>) =>
    buildWeeklySlots(tt([lesson("L1"), lesson("L2")], [card("L1", a), card("L2", b)]));

  test("períodos adjacentes (09:50 / 10:10) não conflitam", () => {
    expect(two({ period: 1 }, { period: 2 }).overlaps).toEqual([]);
  });

  test("N123 (19:00-22:00) conflita com N12 (18:00-19:50) na mesma sala", () => {
    const result = buildWeeklySlots(
      tt(
        [lesson("L1", { periodsPerCard: 2 }), lesson("L2")],
        [card("L1", { period: 5 }), card("L2", { period: 7 })],
      ),
    );
    expect(result.overlaps).toHaveLength(1);
    expect(result.overlaps[0]).toMatchObject({ classroomId: "R1", weekday: 0 });
  });

  test("terms 1100 x 0011 não conflitam; 1100 x 0110 conflitam", () => {
    expect(two({ terms: "1100" }, { terms: "0011" }).overlaps).toEqual([]);
    expect(two({ terms: "1100" }, { terms: "0110" }).overlaps).toHaveLength(1);
  });

  test("weeks disjuntas não conflitam", () => {
    expect(two({ weeks: "10" }, { weeks: "01" }).overlaps).toEqual([]);
  });

  test("salas ou dias diferentes não conflitam", () => {
    expect(two({}, { classroomIds: ["R2"] }).overlaps).toEqual([]);
    expect(two({}, { days: "01000" }).overlaps).toEqual([]);
  });

  test("slots no_room e multiple_rooms são ignorados", () => {
    expect(two({}, { classroomIds: [] }).overlaps).toEqual([]);
    expect(two({ classroomIds: ["R1", "R2"] }, {}).overlaps).toEqual([]);
  });

  test("cada par é reportado uma vez, ordenado deterministicamente", () => {
    const result = buildWeeklySlots(
      tt(
        [lesson("L3"), lesson("L1"), lesson("L2")],
        [card("L3"), card("L1"), card("L2", { classroomIds: ["R0"] }), card("L2")],
      ),
    );
    expect(result.overlaps.map((o) => [o.classroomId, o.a.lessonId, o.b.lessonId])).toEqual([
      ["R1", "L1", "L2"],
      ["R1", "L1", "L3"],
      ["R1", "L2", "L3"],
    ]);
  });

  test("slots ordenados por dia, início e lessonId", () => {
    const { slots } = buildWeeklySlots(
      tt(
        [lesson("B"), lesson("A")],
        [
          card("B", { days: "01000" }),
          card("B", { period: 2 }),
          card("A", { period: 2 }),
          card("A"),
        ],
      ),
    );
    expect(slots.map((s) => `${s.weekday}${s.start}${s.lessonId}`)).toEqual([
      "008:00A",
      "010:10A",
      "010:10B",
      "108:00B",
    ]);
  });
});

describe("masksOverlap", () => {
  test("null é todos", () => {
    expect(masksOverlap(null, null)).toBe(true);
    expect(masksOverlap(null, "0100")).toBe(true);
    expect(masksOverlap(null, "0000")).toBe(false);
    expect(masksOverlap("0000", null)).toBe(false);
    expect(masksOverlap("0010", null)).toBe(true);
  });

  test("tamanhos diferentes: prefixo comum, faltante = 0", () => {
    expect(masksOverlap("11", "0011")).toBe(false);
    expect(masksOverlap("0011", "0010")).toBe(true);
    expect(masksOverlap("1", "1000")).toBe(true);
  });

  test("máscaras separadas por vírgula: qualquer par", () => {
    expect(masksOverlap("10,01", "01")).toBe(true);
    expect(masksOverlap("10,10", "01")).toBe(false);
  });
});

describe("fixtures", () => {
  test("lessons-without-cards.xml reporta lesson_without_cards", async () => {
    const result = await fromFixture("lessons-without-cards.xml");
    expect(result.issues.map((i) => i.code)).toEqual([
      "lesson_without_cards",
      "lesson_without_cards",
    ]);
    expect(result.slots).toEqual([]);
  });

  test("edge-cards.xml cobre estouro, período inexistente, dias vazios e conflito", async () => {
    const result = await fromFixture("edge-cards.xml");
    expect(result.issues.map((i) => `${i.code}:${i.ref}`).sort()).toEqual([
      "invalid_days:L5",
      "missing_period:L4",
      "period_overflow:L3",
    ]);
    expect(result.overlaps).toHaveLength(1);
  });
});
