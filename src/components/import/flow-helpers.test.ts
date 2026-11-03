import { describe, expect, test } from "bun:test";
import type { RoomSuggestion, TeacherSuggestion } from "#/application/import-mappings";
import { EMPTY_COUNTS } from "#/domain/import-batch";
import {
  applySentence,
  CREATE_VALUE,
  discardState,
  formatDate,
  formatDateTime,
  formatInstant,
  groupAlterations,
  IGNORE_VALUE,
  pairBeforeAfter,
  resultCards,
  roomChoiceOf,
  roomMappingsToSave,
  roomsToCreate,
  spaceValue,
  teacherChoiceOf,
  teacherMappingsToSave,
  termsWithoutDates,
  userValue,
  versionCards,
  viewFilter,
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
    expect(formatInstant("não é data", "America/Sao_Paulo")).toBe("não é data");
    expect(formatInstant("2026-11-02T13:30:00.000Z", "America/Sao_Paulo")).toBe("02/11/2026 10:30");
    // Independe do fuso do processo: o servidor e o navegador mostram o mesmo texto.
    expect(formatInstant("2026-11-02T13:30:00.000Z", "UTC")).toBe("02/11/2026 13:30");
    expect(formatInstant("2026-11-02T01:30:00.000Z", "America/Sao_Paulo")).toBe("01/11/2026 22:30");
  });
});

const version = {
  supersedesBatchId: "b0",
  inclusoes: 2,
  alteracoes: 3,
  bloqueadas: 1,
  remocoes: 4,
  responsaveis: 5,
  inalteradas: 100,
  mantidasCanceladas: 6,
  affectedUserIds: [],
};

describe("cartões da nova versão", () => {
  test("rótulos e contagens na ordem da conferência", () => {
    expect(versionCards(version).map((card) => [card.label, card.count])).toEqual([
      ["Inclusões", 2],
      ["Alterações", 3],
      ["Bloqueadas", 1],
      ["Remoções", 4],
      ["Inalteradas", 100],
      ["Canceladas mantidas", 6],
      ["Troca de responsável", 5],
    ]);
  });

  test("Inclusões mostra quantas estão em conflito, só quando há", () => {
    const inclusions = (v: Parameters<typeof versionCards>[0]) =>
      versionCards(v).find((card) => card.view === "inclusao")?.display;
    expect(inclusions(version)).toBe("2");
    expect(inclusions({ ...version, inclusoesEmConflito: 0 })).toBe("2");
    expect(inclusions({ ...version, inclusoesEmConflito: 1 })).toBe("2 (1 em conflito)");
    expect(versionCards({ ...version, inclusoesEmConflito: 1 })[1]?.display).toBe("3");
  });

  test("cada cartão aponta para o filtro do servidor", () => {
    expect(viewFilter("")).toEqual({});
    expect(viewFilter("remocao")).toEqual({ changeKind: "remocao" });
    expect(viewFilter("bloqueada")).toEqual({
      changeKind: "alteracao",
      status: "alteracao_bloqueada",
    });
  });
});

describe("frase de confirmação", () => {
  test("cancela X e cria Y", () => {
    expect(applySentence({ cancelar: 3, pendente: 5, responsavel: 0 })).toBe(
      "Serão canceladas 3 ocupações e criadas 5.",
    );
    expect(applySentence({ cancelar: 1, pendente: 1, responsavel: 0 })).toBe(
      "Será cancelada 1 ocupação e criada 1.",
    );
    expect(applySentence({ cancelar: 0, pendente: 0, responsavel: 2 })).toBe(
      "Nenhuma ocupação será cancelada ou criada; 2 trocas de responsável.",
    );
    expect(applySentence({ cancelar: 2, pendente: 0, responsavel: 1 })).toBe(
      "Serão canceladas 2 ocupações e criadas 0; 1 troca de responsável.",
    );
  });
});

describe("agrupamento de alterações", () => {
  const row = (rowKey: string, title: string, date: string, status: string, startTime = "08:00") =>
    ({ rowKey, title, date, status, startTime }) as const;

  test("pareia cancelar e inserir pelo título e pela data", () => {
    const groups = groupAlterations([
      row("c:1", "Alg — T1", "2026-08-03", "cancelar"),
      row("o:9", "Alg — T1", "2026-08-03", "pendente", "10:00"),
      row("c:2", "Cal — T2", "2026-08-03", "cancelar"),
      row("o:8", "Cal — T2", "2026-08-04", "pendente"),
    ]);
    expect(groups).toHaveLength(3);
    expect(groups[0]?.before.map((r) => r.rowKey)).toEqual(["c:1"]);
    expect(groups[0]?.after.map((r) => r.rowKey)).toEqual(["o:9"]);
    expect(groups[1]?.before).toHaveLength(1);
    expect(groups[1]?.after).toHaveLength(0);
    expect(groups[2]?.before).toHaveLength(0);
    expect(groups[2]?.after).toHaveLength(1);
  });

  test("grupo bloqueado: o que fica (b:) é antes; o impedido é depois", () => {
    const [group] = groupAlterations([
      row("b:1", "Alg — T1", "2026-08-03", "alteracao_bloqueada"),
      row("o:9", "Alg — T1", "2026-08-03", "alteracao_bloqueada"),
    ]);
    expect(group?.blocked).toBe(true);
    expect(group?.before.map((r) => r.rowKey)).toEqual(["b:1"]);
    expect(group?.after.map((r) => r.rowKey)).toEqual(["o:9"]);
  });

  test("multiconjunto: duas ocupações da mesma aula e data ficam no mesmo grupo", () => {
    const [group, ...rest] = groupAlterations([
      row("c:1", "Alg — T1", "2026-08-03", "cancelar"),
      row("c:2", "Alg — T1", "2026-08-03", "cancelar", "10:00"),
      row("o:1", "Alg — T1", "2026-08-03", "pendente"),
    ]);
    expect(rest).toHaveLength(0);
    expect(group?.before).toHaveLength(2);
    expect(group?.after).toHaveLength(1);
  });

  test("linhas sem data ficam em grupo próprio e a ordem de chegada é mantida", () => {
    const groups = groupAlterations([
      row("n:0", "Fís — T3", "", "nao_aplicavel"),
      row("c:1", "Alg — T1", "2026-08-03", "cancelar"),
    ]);
    expect(groups.map((g) => g.title)).toEqual(["Fís — T3", "Alg — T1"]);
  });
});

describe("descarte do lote", () => {
  const counts = (over: Record<string, number>) => ({ ...EMPTY_COUNTS, ...over });

  test("rascunho e preparando sempre podem ser descartados", () => {
    expect(
      discardState({ status: "rascunho", summary: { counts: counts({ aplicada: 5 }) } }),
    ).toEqual({
      visible: true,
      allowed: true,
      reason: null,
    });
    expect(discardState({ status: "preparando", summary: { counts: counts({}) } }).allowed).toBe(
      true,
    );
  });

  test("falhou sem nada aplicado pode; com algo aplicado pede para retomar", () => {
    expect(
      discardState({ status: "falhou", summary: { counts: counts({ falha: 2 }) } }).allowed,
    ).toBe(true);
    for (const key of ["aplicada", "cancelada_versao", "responsavel_atualizado"]) {
      const state = discardState({ status: "falhou", summary: { counts: counts({ [key]: 1 }) } });
      expect(state.allowed).toBe(false);
      expect(state.reason).toContain("retome a aplicação");
    }
  });

  test("aplicando e aplicado não oferecem descarte", () => {
    expect(discardState({ status: "aplicado", summary: { counts: counts({}) } }).visible).toBe(
      false,
    );
    expect(discardState({ status: "aplicando", summary: { counts: counts({}) } }).visible).toBe(
      false,
    );
  });
});

describe("cartões do resultado", () => {
  test("canceladas, criadas, trocas, bloqueadas, conflitos e falhas", () => {
    const cards = resultCards({
      ...EMPTY_COUNTS,
      cancelada_versao: 4,
      aplicada: 5,
      responsavel_atualizado: 1,
      alteracao_bloqueada: 2,
      conflito: 3,
      conflito_interno: 1,
      falha: 7,
    });
    expect(cards.map((c) => [c.label, c.count])).toEqual([
      ["Ocupações canceladas", 4],
      ["Ocupações criadas", 5],
      ["Responsáveis trocados", 1],
      ["Alterações bloqueadas", 2],
      ["Conflitos", 4],
      ["Falhas", 7],
    ]);
  });
});

describe("pares antes/depois", () => {
  test("casa um a um na ordem e deixa a sobra sem par", () => {
    expect(pairBeforeAfter(["a1", "a2", "a3"], ["d1"])).toEqual([
      { before: "a1", after: "d1" },
      { before: "a2", after: null },
      { before: "a3", after: null },
    ]);
    expect(pairBeforeAfter([], ["d1"])).toEqual([{ before: null, after: "d1" }]);
    expect(pairBeforeAfter([], [])).toEqual([]);
  });
});
