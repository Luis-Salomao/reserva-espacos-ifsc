import { describe, expect, test } from "bun:test";
import {
  cellsFor,
  contrastRatio,
  RESERVA_TONE,
  SUBJECT_PALETTE,
  subjectOf,
  subjectTone,
  weekOf,
} from "./overview";

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

describe("weekOf", () => {
  test("de uma quarta devolve segunda a sexta da mesma semana", () => {
    expect(weekOf("2026-11-04")).toEqual([
      "2026-11-02",
      "2026-11-03",
      "2026-11-04",
      "2026-11-05",
      "2026-11-06",
    ]);
  });

  test("de uma segunda começa nela e de um domingo volta à segunda anterior", () => {
    expect(weekOf("2026-11-02")[0]).toBe("2026-11-02");
    expect(weekOf("2026-11-08")).toEqual([
      "2026-11-02",
      "2026-11-03",
      "2026-11-04",
      "2026-11-05",
      "2026-11-06",
    ]);
  });

  test("atravessa a virada de mês", () => {
    expect(weekOf("2026-12-31")).toEqual([
      "2026-12-28",
      "2026-12-29",
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
    ]);
  });
});
