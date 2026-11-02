import { describe, expect, test } from "bun:test";
import type { Semester } from "#/domain/semester";
import type { AscTimetable, Lesson } from "#/domain/timetable";
import type { WeeklySlot } from "#/import-asc/slots";
import { type PlanInput, planImport } from "./import-plan";

const semester: Semester = {
  id: "sem",
  name: "2026.2",
  start: "2026-08-03",
  end: "2026-08-16",
  terms: [
    { position: 1, start: "2026-08-03", end: "2026-08-09" },
    { position: 2, start: "2026-08-10", end: "2026-08-16" },
  ],
  blocks: [],
};

function lesson(over: Partial<Lesson> = {}): Lesson {
  return {
    id: "L1",
    subjectId: "S1",
    classIds: ["C1", "C2"],
    teacherIds: ["T1", "T2"],
    classroomIds: ["R1"],
    periodsPerCard: 1,
    termsDefId: null,
    weeksDefId: null,
    daysDefId: null,
    ...over,
  };
}

const timetable = (lessons: Lesson[]): AscTimetable => ({
  periods: [],
  days: [],
  terms: [],
  weeks: [],
  classrooms: [],
  teachers: [],
  subjects: [{ id: "S1", name: "Algoritmos e Programação", short: "ALG" }],
  classes: [
    { id: "C1", name: "Turma 1", short: "T1A" },
    { id: "C2", name: "Turma 2", short: "T2B" },
  ],
  lessons,
  cards: [],
});

function slot(over: Partial<WeeklySlot> = {}): WeeklySlot {
  return {
    lessonId: "L1",
    weekday: 0,
    start: "08:00",
    end: "09:50",
    periodFrom: 1,
    periodTo: 1,
    segments: [{ period: 1, start: "08:00", end: "09:50" }],
    classroomIds: ["R1"],
    termsMask: "1100",
    weeksMask: "1",
    status: "applicable",
    ...over,
  };
}

function input(over: Partial<PlanInput> = {}): PlanInput {
  return {
    preview: { slots: [slot()], timetable: timetable([lesson()]) },
    semester,
    roomMap: new Map([["R1", "space-1"]]),
    teacherMap: new Map(),
    existing: [],
    ...over,
  };
}

function titleOf(tt: AscTimetable, s: WeeklySlot = slot()): string | undefined {
  return planImport(input({ preview: { slots: [s], timetable: tt } })).toInsert[0]?.title;
}

describe("planImport", () => {
  test("gera uma ocupação por data com título e sem docente no título", () => {
    const plan = planImport(input());
    expect(plan.notApplicable).toEqual([]);
    expect(plan.conflicts).toEqual([]);
    expect(plan.toInsert.map((d) => d.startsAt)).toEqual(["2026-08-03T08:00", "2026-08-10T08:00"]);
    expect(plan.toInsert[0]).toMatchObject({
      lessonId: "L1",
      spaceId: "space-1",
      endsAt: "2026-08-03T09:50",
      title: "ALG — T1A, T2B",
      responsibleUserId: null,
    });
    expect(new Set(plan.toInsert.map((d) => d.rowKey)).size).toBe(2);
  });

  test("título cai para o nome da disciplina e para 'Aula' sem disciplina nem turma", () => {
    const named = timetable([lesson()]);
    named.subjects[0] = { id: "S1", name: "Redes", short: "" };
    expect(titleOf(named)).toBe("Redes — T1A, T2B");
    const bare = timetable([lesson({ subjectId: null, classIds: [] })]);
    expect(titleOf(bare)).toBe("Aula");
    expect(titleOf(bare, slot({ lessonId: "X" }))).toBe("Aula");
    expect(titleOf(timetable([lesson({ subjectId: null })]))).toBe("T1A, T2B");
    expect(titleOf(timetable([lesson({ classIds: [] })]))).toBe("ALG");
  });

  test("responsável é a conta do primeiro docente com vínculo", () => {
    const second = planImport(
      input({
        teacherMap: new Map<string, string | null>([
          ["T1", null],
          ["T2", "user-2"],
        ]),
      }),
    );
    expect(second.toInsert[0]?.responsibleUserId).toBe("user-2");
    const first = planImport(
      input({
        teacherMap: new Map<string, string | null>([
          ["T1", "user-1"],
          ["T2", "user-2"],
        ]),
      }),
    );
    expect(first.toInsert[0]?.responsibleUserId).toBe("user-1");
  });

  test("segmentos geram ocorrências separadas: intervalo livre", () => {
    const merged = slot({
      end: "12:00",
      periodTo: 2,
      segments: [
        { period: 1, start: "08:00", end: "09:50" },
        { period: 2, start: "10:10", end: "12:00" },
      ],
    });
    const plan = planImport(
      input({ preview: { slots: [merged], timetable: timetable([lesson()]) } }),
    );
    expect(plan.toInsert.map((d) => `${d.startsAt}/${d.endsAt}`)).toEqual([
      "2026-08-03T08:00/2026-08-03T09:50",
      "2026-08-03T10:10/2026-08-03T12:00",
      "2026-08-10T08:00/2026-08-10T09:50",
      "2026-08-10T10:10/2026-08-10T12:00",
    ]);
  });

  test("motivos de não aplicável", () => {
    const slots = [
      slot({ status: "no_room", classroomIds: [] }),
      slot({ status: "multiple_rooms", classroomIds: ["R1", "R2"] }),
      slot({ classroomIds: ["R9"] }),
      slot({ classroomIds: ["R3"] }),
      slot({ termsMask: "0010" }),
      slot({ weeksMask: "10" }),
    ];
    const plan = planImport(
      input({
        preview: { slots, timetable: timetable([lesson()]) },
        roomMap: new Map([
          ["R1", "space-1"],
          ["R3", "ignore"],
        ]),
      }),
    );
    expect(plan.toInsert).toEqual([]);
    expect(plan.notApplicable.map((n) => n.reason)).toEqual([
      "no_room",
      "multiple_rooms",
      "room_unmapped",
      "room_ignored",
      "term_without_dates",
      "weeks_unsupported",
    ]);
    expect(new Set(plan.notApplicable.map((n) => n.rowKey)).size).toBe(6);
    expect(plan.notApplicable[2]?.detail).toContain("R9");
    expect(plan.notApplicable[4]?.detail).toContain("3");
    expect(plan.notApplicable[0]).toMatchObject({ lessonId: "L1", weekday: 0, start: "08:00" });
  });

  test("conflito com ocupação ativa existente no mesmo espaço (meio-aberto)", () => {
    const plan = planImport(
      input({
        existing: [
          {
            id: "occ-1",
            spaceId: "space-1",
            startsAt: "2026-08-03T09:00",
            endsAt: "2026-08-03T10:00",
          },
          // adjacente: não conflita
          {
            id: "occ-2",
            spaceId: "space-1",
            startsAt: "2026-08-10T09:50",
            endsAt: "2026-08-10T11:00",
          },
          // outro espaço: não conflita
          {
            id: "occ-3",
            spaceId: "space-2",
            startsAt: "2026-08-10T08:00",
            endsAt: "2026-08-10T09:00",
          },
        ],
      }),
    );
    expect(plan.conflicts).toHaveLength(1);
    expect(plan.conflicts[0]?.existingId).toBe("occ-1");
    expect(plan.conflicts[0]?.draft.startsAt).toBe("2026-08-03T08:00");
    expect(plan.toInsert.map((d) => d.startsAt)).toEqual(["2026-08-10T08:00"]);
  });

  test("duas aulas no mesmo espaço e horário viram conflito interno e não são inseridas", () => {
    const plan = planImport(
      input({
        preview: {
          slots: [slot(), slot({ lessonId: "L2" }), slot({ lessonId: "L3", weekday: 1 })],
          timetable: timetable([lesson(), lesson({ id: "L2" }), lesson({ id: "L3" })]),
        },
      }),
    );
    expect(plan.internalConflicts.map((c) => c.draft.lessonId).sort()).toEqual([
      "L1",
      "L1",
      "L2",
      "L2",
    ]);
    expect(plan.toInsert.every((d) => d.lessonId === "L3")).toBe(true);
    expect(plan.toInsert).toHaveLength(2);
    const keys = new Set(plan.internalConflicts.map((c) => c.draft.rowKey));
    for (const conflict of plan.internalConflicts) {
      expect(keys.has(conflict.otherRowKey)).toBe(true);
      expect(conflict.otherRowKey).not.toBe(conflict.draft.rowKey);
    }
  });

  test("slots idênticos repetidos da mesma aula não geram duplicata nem conflito", () => {
    const plan = planImport(
      input({ preview: { slots: [slot(), slot()], timetable: timetable([lesson()]) } }),
    );
    expect(plan.toInsert).toHaveLength(2);
    expect(plan.internalConflicts).toEqual([]);
  });

  test("horário do bloco do semestre com o mesmo número do período vence o do XML", () => {
    const sem: Semester = {
      ...semester,
      blocks: [{ number: 1, name: "Manhã 1", short: "M1", start: "08:10", end: "09:55" }],
    };
    const two = slot({
      end: "12:00",
      periodTo: 2,
      segments: [
        { period: 1, start: "08:00", end: "09:50" },
        { period: 2, start: "10:10", end: "12:00" },
      ],
    });
    const plan = planImport(
      input({ semester: sem, preview: { slots: [two], timetable: timetable([lesson()]) } }),
    );
    expect(plan.toInsert.slice(0, 2).map((d) => `${d.startsAt}/${d.endsAt}`)).toEqual([
      "2026-08-03T08:10/2026-08-03T09:55",
      "2026-08-03T10:10/2026-08-03T12:00",
    ]);
  });

  test("detalhe de sala sem vínculo usa a sigla da sala, não a id do aSc", () => {
    const tt = timetable([lesson()]);
    tt.classrooms.push({ id: "R9", name: "Laboratório 9", short: "LAB9", capacity: null });
    const plan = planImport(
      input({ preview: { slots: [slot({ classroomIds: ["R9"] })], timetable: tt } }),
    );
    expect(plan.notApplicable[0]?.detail).toContain("LAB9");
    expect(plan.notApplicable[0]?.detail).not.toContain("R9");
  });

  test("mesma aula, sala e início com fim diferente é contada, não descartada", () => {
    const other = slot({ segments: [{ period: 1, start: "08:00", end: "10:30" }], end: "10:30" });
    const plan = planImport(
      input({ preview: { slots: [slot(), other], timetable: timetable([lesson()]) } }),
    );
    expect(plan.toInsert).toHaveLength(2);
    expect(plan.notApplicable.map((n) => n.reason)).toEqual([
      "duplicate_occurrence",
      "duplicate_occurrence",
    ]);
    expect(new Set(plan.notApplicable.map((n) => n.rowKey)).size).toBe(2);
  });

  test("máscara de durações sem nenhuma marca: nunca agendada", () => {
    const plan = planImport(
      input({
        preview: { slots: [slot({ termsMask: "0000" })], timetable: timetable([lesson()]) },
      }),
    );
    expect(plan.notApplicable.map((n) => n.reason)).toEqual(["never_scheduled"]);
    expect(plan.notApplicable[0]?.detail).toContain("nenhuma duração");
  });

  test("desempenho: ~200 slots x 20 semanas em menos de 1 s", () => {
    const lessons: Lesson[] = [];
    const slots: WeeklySlot[] = [];
    for (let index = 0; index < 200; index++) {
      lessons.push(lesson({ id: `L${index}` }));
      const hour = String(8 + (index % 12)).padStart(2, "0");
      slots.push(
        slot({
          lessonId: `L${index}`,
          weekday: index % 5,
          start: `${hour}:00`,
          end: `${hour}:50`,
          segments: [{ period: 1, start: `${hour}:00`, end: `${hour}:50` }],
          classroomIds: [`R${index % 17}`],
          termsMask: null,
        }),
      );
    }
    const roomMap = new Map<string, string>();
    for (let r = 0; r < 17; r++) roomMap.set(`R${r}`, `space-${r}`);
    const started = performance.now();
    const plan = planImport({
      preview: { slots, timetable: timetable(lessons) },
      semester: { ...semester, end: "2026-12-19", terms: [] },
      roomMap,
      teacherMap: new Map(),
      existing: [],
    });
    const elapsed = performance.now() - started;
    expect(plan.toInsert.length + plan.internalConflicts.length).toBeGreaterThan(3000);
    expect(elapsed).toBeLessThan(1000);
  });
});
