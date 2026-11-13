import { describe, expect, test } from "bun:test";
import {
  cellsFor,
  contrastRatio,
  defaultRange,
  RESERVA_TONE,
  rangeIssue,
  rangeLength,
  resolveRange,
  roomsOnDay,
  SUBJECT_PALETTE,
  shiftRange,
  spanOf,
  subjectOf,
  subjectTone,
} from "./overview";
import { availabilityIn } from "./room-filter";

/** Fundos reais de `src/styles/tokens.css`. */
const LIGHT_BG = "#ffffff";
const DARK_BG = "#0e0e11";

const FIRST = { label: "1º", short: "M1", start: "07:30", end: "08:20" };
const SECOND = { label: "2º", short: "M2", start: "08:20", end: "09:10" };
const THIRD = { label: "3º", short: "M3", start: "09:30", end: "10:20" };
const BLOCKS = [FIRST, SECOND, THIRD];

function item(id: string, start: string, end: string) {
  return { id, start, end };
}

describe("subjectOf", () => {
  test("a matéria é a parte do título antes de ' — '", () => {
    expect(subjectOf("Cálculo I — ELT 2025.1")).toBe("Cálculo I");
  });

  test("título sem ' — ' usa o título inteiro, aparado", () => {
    expect(subjectOf("  Reunião de colegiado  ")).toBe("Reunião de colegiado");
  });

  test("título sem nada antes de ' — ' usa o título inteiro", () => {
    expect(subjectOf(" — ELT 2025.1")).toBe("— ELT 2025.1");
  });
});

describe("subjectTone", () => {
  test("a mesma matéria tem sempre o mesmo índice, venha de qualquer turma", () => {
    const tone = subjectTone(subjectOf("Física II — ELT 2025.1"));
    expect(subjectTone(subjectOf("Física II — MEC 2024.2"))).toBe(tone);
    expect(subjectTone("Física II")).toBe(tone);
  });

  test("o índice está dentro da paleta e matérias diferentes se espalham pelas cores", () => {
    const subjects = [
      "Cálculo I",
      "Física II",
      "Química Geral",
      "Algoritmos",
      "Eletrônica Digital",
      "Desenho Técnico",
      "Inglês Instrumental",
      "Circuitos Elétricos",
      "Metodologia Científica",
      "Banco de Dados",
      "Redes de Computadores",
      "Sistemas Operacionais",
    ];
    const tones = subjects.map(subjectTone);
    for (const tone of tones) {
      expect(Number.isInteger(tone)).toBe(true);
      expect(tone).toBeGreaterThanOrEqual(0);
      expect(tone).toBeLessThan(SUBJECT_PALETTE.length);
    }
    expect(new Set(tones).size).toBeGreaterThanOrEqual(6);
  });
});

describe("contrastRatio", () => {
  test("segue a fórmula da WCAG", () => {
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 5);
    expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
    expect(contrastRatio("#ffffff", "#777777")).toBeCloseTo(4.48, 2);
    expect(contrastRatio("#0e0e11", "#0e0e11")).toBe(1);
  });
});

describe("paleta", () => {
  test("tem pelo menos 10 cores distintas em cada tema, em hex", () => {
    const hex = /^#[0-9a-f]{6}$/i;
    for (const tone of SUBJECT_PALETTE) {
      expect(tone.light).toMatch(hex);
      expect(tone.dark).toMatch(hex);
    }
    expect(new Set(SUBJECT_PALETTE.map((tone) => tone.light.toLowerCase())).size).toBe(
      SUBJECT_PALETTE.length,
    );
    expect(new Set(SUBJECT_PALETTE.map((tone) => tone.dark.toLowerCase())).size).toBe(
      SUBJECT_PALETTE.length,
    );
    expect(SUBJECT_PALETTE.length).toBeGreaterThanOrEqual(10);
  });

  test("toda cor tem contraste de pelo menos 3:1 contra o fundo do seu tema", () => {
    for (const tone of [...SUBJECT_PALETTE, RESERVA_TONE]) {
      expect(contrastRatio(tone.light, LIGHT_BG)).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(tone.dark, DARK_BG)).toBeGreaterThanOrEqual(3);
    }
  });

  test("a cor de reserva não se confunde com nenhuma cor de matéria", () => {
    const light = SUBJECT_PALETTE.map((tone) => tone.light.toLowerCase());
    const dark = SUBJECT_PALETTE.map((tone) => tone.dark.toLowerCase());
    expect(light.includes(RESERVA_TONE.light.toLowerCase())).toBe(false);
    expect(dark.includes(RESERVA_TONE.dark.toLowerCase())).toBe(false);
  });
});

describe("cellsFor", () => {
  test("devolve uma célula por bloco, na ordem dos blocos; bloco livre vem vazio", () => {
    const { cells, outside } = cellsFor([], BLOCKS);
    expect(cells.map((cell) => cell.block)).toEqual(BLOCKS);
    expect(cells.map((cell) => cell.items)).toEqual([[], [], []]);
    expect(outside).toEqual([]);
  });

  test("ocupação que cobre o bloco inteiro não é parcial", () => {
    const aula = item("a", "07:30", "08:20");
    const { cells } = cellsFor([aula], BLOCKS);
    expect(cells[0]?.items).toEqual([{ item: aula, partial: false }]);
    expect(cells[1]?.items).toEqual([]);
  });

  test("ocupação que cruza dois blocos aparece nos dois", () => {
    const aula = item("a", "07:30", "09:10");
    const { cells, outside } = cellsFor([aula], BLOCKS);
    expect(cells[0]?.items).toEqual([{ item: aula, partial: false }]);
    expect(cells[1]?.items).toEqual([{ item: aula, partial: false }]);
    expect(cells[2]?.items).toEqual([]);
    expect(outside).toEqual([]);
  });

  test("ocupação que cobre só parte do bloco é marcada como parcial", () => {
    const tarde = item("a", "07:50", "08:20");
    const cedo = item("b", "08:20", "08:40");
    const { cells } = cellsFor([tarde, cedo], BLOCKS);
    expect(cells[0]?.items).toEqual([{ item: tarde, partial: true }]);
    expect(cells[1]?.items).toEqual([{ item: cedo, partial: true }]);
  });

  test("duas ocupações no mesmo bloco aparecem as duas, na ordem recebida", () => {
    const uma = item("a", "07:30", "07:55");
    const outra = item("b", "07:55", "08:20");
    const { cells } = cellsFor([uma, outra], BLOCKS);
    expect(cells[0]?.items).toEqual([
      { item: uma, partial: true },
      { item: outra, partial: true },
    ]);
  });

  test("ocupação que começa antes do primeiro bloco pinta os blocos que cruza", () => {
    const aula = item("a", "06:00", "08:40");
    const { cells, outside } = cellsFor([aula], BLOCKS);
    expect(cells[0]?.items).toEqual([{ item: aula, partial: false }]);
    expect(cells[1]?.items).toEqual([{ item: aula, partial: true }]);
    expect(cells[2]?.items).toEqual([]);
    expect(outside).toEqual([]);
  });

  test("ocupação que termina depois do último bloco pinta os blocos que cruza", () => {
    const aula = item("a", "10:00", "12:00");
    const { cells, outside } = cellsFor([aula], BLOCKS);
    expect(cells[2]?.items).toEqual([{ item: aula, partial: true }]);
    expect(outside).toEqual([]);
  });

  test("ocupação que só encosta no bloco não o cruza", () => {
    const aula = item("a", "09:10", "09:30");
    const { cells, outside } = cellsFor([aula], BLOCKS);
    expect(cells.map((cell) => cell.items)).toEqual([[], [], []]);
    expect(outside).toEqual([aula]);
  });

  test("ocupação entre dois blocos, ou fora de todos, vai para outside", () => {
    const intervalo = item("a", "09:12", "09:28");
    const noite = item("b", "19:00", "22:00");
    const aula = item("c", "07:30", "08:20");
    const { cells, outside } = cellsFor([intervalo, aula, noite], BLOCKS);
    expect(outside).toEqual([intervalo, noite]);
    expect(cells[0]?.items).toEqual([{ item: aula, partial: false }]);
  });

  test("sem blocos, toda ocupação vai para outside", () => {
    const aula = item("a", "07:30", "08:20");
    expect(cellsFor([aula], [])).toEqual({ cells: [], outside: [aula] });
  });
});

describe("intervalo da visão geral", () => {
  test("o padrão é hoje até hoje + 6, atravessando o mês", () => {
    expect(defaultRange("2026-11-12")).toEqual({ from: "2026-11-12", to: "2026-11-18" });
    expect(defaultRange("2026-12-28")).toEqual({ from: "2026-12-28", to: "2027-01-03" });
  });

  test("resolveRange: de e ate; só de vira de + 6; sem de, o padrão de hoje", () => {
    expect(resolveRange("2026-11-02", "2026-11-04", "2026-11-12")).toEqual({
      from: "2026-11-02",
      to: "2026-11-04",
    });
    expect(resolveRange("2026-11-02", undefined, "2026-11-12")).toEqual({
      from: "2026-11-02",
      to: "2026-11-08",
    });
    expect(resolveRange(undefined, undefined, "2026-11-12")).toEqual(defaultRange("2026-11-12"));
  });

  test("conta as duas pontas e limita a 31 dias", () => {
    expect(rangeLength("2026-11-12", "2026-11-12")).toBe(1);
    expect(rangeIssue("2026-11-01", "2026-12-01")).toBeNull();
    expect(rangeIssue("2026-11-01", "2026-12-02")).toContain("31 dias");
    expect(rangeIssue("2026-11-13", "2026-11-12")).toContain("anterior ou igual");
  });

  test("desloca pelo tamanho do intervalo, para trás e para a frente", () => {
    expect(shiftRange("2026-11-12", "2026-11-18", 1)).toEqual({
      from: "2026-11-19",
      to: "2026-11-25",
    });
    expect(shiftRange("2026-11-12", "2026-11-18", -1)).toEqual({
      from: "2026-11-05",
      to: "2026-11-11",
    });
    expect(shiftRange("2026-11-12", "2026-11-13", 1)).toEqual({
      from: "2026-11-14",
      to: "2026-11-15",
    });
  });
});

describe("spanOf", () => {
  test("vai do início do primeiro bloco ao fim do último, com o intervalo entre eles", () => {
    expect(spanOf(BLOCKS, 0, 2)).toEqual({ start: "07:30", end: "10:20" });
  });

  test("arrastar para trás dá o mesmo trecho", () => {
    expect(spanOf(BLOCKS, 2, 1)).toEqual({ start: "08:20", end: "10:20" });
  });

  test("um bloco só é o próprio bloco", () => {
    expect(spanOf(BLOCKS, 1, 1)).toEqual({ start: "08:20", end: "09:10" });
  });

  test("bloco inexistente não forma trecho", () => {
    expect(spanOf(BLOCKS, 0, 3)).toBeNull();
    expect(spanOf([], 0, 0)).toBeNull();
  });
});

describe("roomsOnDay", () => {
  const MON = "2026-11-09";
  const TUE = "2026-11-10";
  const lesson = (date: string, start: string, end: string, title = "Cálculo I") => ({
    id: `${date}-${start}`,
    date,
    start,
    end,
    title,
  });
  const ROOMS = [
    {
      space: { id: "a202", name: "A-202", capacity: 40 },
      occupations: [lesson(MON, "08:00", "09:50"), lesson(TUE, "13:30", "15:20", "Física")],
    },
    { space: { id: "b104", name: "B-104", capacity: 25 }, occupations: [] },
  ];

  test("cada sala fica só com as ocupações do dia, a data e o id", () => {
    const [a202, b104] = roomsOnDay(ROOMS, TUE);
    expect(a202?.date).toBe(TUE);
    expect(a202?.spaceId).toBe("a202");
    expect(a202?.occupations.map((item) => item.title)).toEqual(["Física"]);
    expect(b104?.occupations).toEqual([]);
  });

  test("os trechos livres são o dia inteiro menos as ocupações do dia", () => {
    const [a202, b104] = roomsOnDay(ROOMS, TUE);
    expect(a202?.free).toEqual([
      { start: "00:00", end: "13:30" },
      { start: "15:20", end: "23:59" },
    ]);
    expect(b104?.free).toEqual([{ start: "00:00", end: "23:59" }]);
  });

  test("com availabilityIn, a sala ocupada na tarde sai com o motivo e a outra fica livre", () => {
    const { free, busy } = availabilityIn(
      roomsOnDay(ROOMS, TUE),
      { start: "13:30", end: "17:10" },
      `${MON}T09:00`,
    );
    expect(free.map((room) => room.spaceId)).toEqual(["b104"]);
    expect(busy.map(({ room, reasons }) => [room.spaceId, reasons])).toEqual([
      ["a202", [{ kind: "occupation", title: "Física", start: "13:30", end: "15:20" }]],
    ]);
  });
});
