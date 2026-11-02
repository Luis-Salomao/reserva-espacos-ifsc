import { describe, expect, test } from "bun:test";
import type { RoomSuggestion, TeacherSuggestion } from "#/application/import-mappings";
import {
  CREATE_VALUE,
  formatDate,
  formatDateTime,
  formatInstant,
  IGNORE_VALUE,
  roomChoiceOf,
  roomMappingsToSave,
  roomsToCreate,
  spaceValue,
  teacherChoiceOf,
  teacherMappingsToSave,
  termsWithoutDates,
  userValue,
} from "./flow-helpers";

describe("termsWithoutDates", () => {
  const terms = [
    { mask: "1000", label: "1º bimestre", slots: 10 },
    { mask: "0110", label: "2º e 3º", slots: 5 },
    { mask: "", label: "Todas", slots: 7 },
  ];
  test("conta os horários das durações marcadas que o semestre não configurou", () => {
    const semester = { terms: [{ position: 1, start: "2026-08-03", end: "2026-09-12" }] };
    expect(termsWithoutDates(terms, semester)).toEqual({ positions: [2, 3], slots: 5 });
  });
  test("tudo configurado ou semestre completo: nada falta", () => {
    const all = [1, 2, 3].map((position) => ({ position, start: "2026-08-03", end: "2026-09-12" }));
    expect(termsWithoutDates(terms, { terms: all })).toEqual({ positions: [], slots: 0 });
  });
  test("semestre sem durações: toda duração marcada falta", () => {
    expect(termsWithoutDates(terms, { terms: [] })).toEqual({ positions: [1, 2, 3], slots: 15 });
  });
});

const room = (over: Partial<RoomSuggestion>): RoomSuggestion => ({
  sourceId: "R1",
  short: "101",
  name: "Sala 101",
  saved: null,
  suggestion: null,
  ...over,
});

describe("escolhas de sala", () => {
  test("vínculo salvo vale mais que a sugestão; sem nenhum, fica sem vínculo", () => {
    expect(roomChoiceOf(room({}))).toBe("");
    expect(
      roomChoiceOf(
        room({ suggestion: { target: { spaceId: "s1", ignored: false }, origin: "nome" } }),
      ),
    ).toBe(spaceValue("s1"));
    expect(
      roomChoiceOf(
        room({
          saved: { spaceId: null, ignored: true },
          suggestion: { target: { spaceId: "s1", ignored: false }, origin: "nome" },
        }),
      ),
    ).toBe(IGNORE_VALUE);
    expect(roomChoiceOf(room({ saved: { spaceId: null, ignored: false } }))).toBe("");
  });

  const rooms = [
    { id: "R1", short: "101", name: "Sala 101" },
    { id: "R2", short: "LAB", name: "  " },
    { id: "R3", short: "102", name: "Sala 102" },
    { id: "R4", short: "103", name: "Sala 103" },
  ];
  const choices = {
    R1: spaceValue("s1"),
    R2: CREATE_VALUE,
    R3: IGNORE_VALUE,
    R4: "",
  };

  test("salas a criar usam o nome ou a sigla", () => {
    expect(roomsToCreate(rooms, choices)).toEqual([{ sourceId: "R2", name: "LAB" }]);
  });

  test("grava existente, criada e ignorada; sala sem escolha não é gravada", () => {
    const created = new Map([["R2", "s9"]]);
    expect(roomMappingsToSave(rooms, choices, created)).toEqual([
      { sourceRoomId: "R1", sourceShort: "101", spaceId: "s1", ignored: false },
      { sourceRoomId: "R2", sourceShort: "LAB", spaceId: "s9", ignored: false },
      { sourceRoomId: "R3", sourceShort: "102", spaceId: null, ignored: true },
    ]);
    expect(roomMappingsToSave(rooms, choices, new Map()).map((i) => i.sourceRoomId)).toEqual([
      "R1",
      "R3",
    ]);
  });
});

describe("escolhas de docente", () => {
  const teacher = (over: Partial<TeacherSuggestion>): TeacherSuggestion => ({
    sourceId: "P1",
    short: "FT",
    saved: null,
    suggestion: null,
    ...over,
  });
  test("salvo, sugerido ou sem vínculo", () => {
    expect(teacherChoiceOf(teacher({}))).toBe("");
    expect(teacherChoiceOf(teacher({ suggestion: { userId: "u1", origin: "codigo" } }))).toBe(
      userValue("u1"),
    );
    expect(
      teacherChoiceOf(
        teacher({ saved: { userId: null }, suggestion: { userId: "u1", origin: "codigo" } }),
      ),
    ).toBe("");
  });
  test("grava todos, com null explícito quando sem vínculo", () => {
    const list = [
      { id: "P1", short: "FT" },
      { id: "P2", short: "BE" },
    ];
    expect(teacherMappingsToSave(list, { P1: userValue("u1") })).toEqual([
      { sourceTeacherId: "P1", sourceShort: "FT", userId: "u1" },
      { sourceTeacherId: "P2", sourceShort: "BE", userId: null },
    ]);
  });
});

describe("formatação", () => {
  test("datas e instantes em pt-BR", () => {
    expect(formatDate("2026-08-03")).toBe("03/08/2026");
    expect(formatDate("sem data")).toBe("sem data");
    expect(formatDateTime("2026-08-03T08:00")).toBe("03/08 08:00");
    expect(formatDateTime("lixo")).toBe("lixo");
    expect(formatInstant("não é data")).toBe("não é data");
    expect(formatInstant("2026-11-02T13:30:00.000Z")).toMatch(/^\d{2}\/\d{2}\/\d{2,4}/);
  });
});
