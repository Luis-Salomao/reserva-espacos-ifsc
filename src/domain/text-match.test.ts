import { describe, expect, test } from "bun:test";
import { matchSubjects, normalizeSubject, normalizeText } from "./text-match";

const GROUPS = {
  mine: ["Álgebra — 1A", "Cálculo — 2B"],
  all: ["Química — 3C", "aula 10"],
};

describe("normalizeText", () => {
  test("tira acento, caixa e espaços nas pontas", () => {
    expect(normalizeText("  CÁLCULO — 2B  ")).toBe("calculo — 2b");
    expect(normalizeText("Álgebra")).toBe("algebra");
    expect(normalizeText("aula")).toBe("aula");
  });
});

describe("matchSubjects", () => {
  test("consulta vazia devolve os dois grupos e não é exata", () => {
    expect(matchSubjects(GROUPS, "   ")).toEqual({
      mine: ["Álgebra — 1A", "Cálculo — 2B"],
      all: ["Química — 3C", "aula 10"],
      exact: false,
    });
  });

  test("filtra sem acento nem caixa, nos dois grupos", () => {
    expect(matchSubjects(GROUPS, "  QUIM  ")).toEqual({
      mine: [],
      all: ["Química — 3C"],
      exact: false,
    });
    expect(matchSubjects(GROUPS, "calculo")).toEqual({
      mine: ["Cálculo — 2B"],
      all: [],
      exact: false,
    });
  });

  test("exact só com igualdade depois de normalizar", () => {
    expect(matchSubjects(GROUPS, "calculo").exact).toBe(false);
    expect(matchSubjects(GROUPS, "Cálculo — 2B").exact).toBe(true);
    expect(matchSubjects(GROUPS, "  CÁLCULO — 2b  ").exact).toBe(true);
    expect(matchSubjects(GROUPS, "aula 10").exact).toBe(true);
    expect(matchSubjects(GROUPS, "aula 1").exact).toBe(false);
  });

  test("texto que não aparece em nenhum grupo esvazia os dois", () => {
    expect(matchSubjects(GROUPS, "reunião")).toEqual({ mine: [], all: [], exact: false });
  });
});

test("normalizeSubject junta variantes de caixa, espaços e traço", () => {
  const keys = ["Cultura Digital - LAZ", "cultura  digital–LAZ", " CULTURA DIGITAL — laz "].map(
    normalizeSubject,
  );
  expect(new Set(keys).size).toBe(1);
  expect(keys[0]).toBe("cultura digital - laz");
  expect(normalizeSubject("Física")).toBe("fisica");
  expect(normalizeSubject("Cálculo I")).not.toBe(normalizeSubject("Cálculo II"));
  expect(normalizeSubject("   ")).toBe("");
});
