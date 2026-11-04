import { describe, expect, test } from "bun:test";
import { guessEmail } from "./guess-email";
import { isValidEmail } from "./user";

const none = new Set<string>();

describe("guessEmail", () => {
  test("primeiro.ultimo@ifsc.edu.br, em minúsculas e sem acentos", () => {
    expect(guessEmail("Ana Maria da Silva", "P1", none)).toBe("ana.silva@ifsc.edu.br");
    expect(guessEmail("JOÃO Conceição Araújo", "P1", none)).toBe("joao.araujo@ifsc.edu.br");
    expect(guessEmail("  Éder   Ünal  ", "P1", none)).toBe("eder.unal@ifsc.edu.br");
  });

  test("apóstrofo e hífen não quebram o e-mail", () => {
    expect(guessEmail("Zeca D'Ávila", "P1", none)).toBe("zeca.davila@ifsc.edu.br");
    expect(guessEmail("Lia Prado-Souza", "P1", none)).toBe("lia.souza@ifsc.edu.br");
  });

  test("nome de uma palavra vira palavra@ifsc.edu.br", () => {
    expect(guessEmail("Cecília", "P1", none)).toBe("cecilia@ifsc.edu.br");
  });

  test("nome vazio ou sem letras usa docente.ID@ifsc.edu.br", () => {
    expect(guessEmail("", "P7", none)).toBe("docente.p7@ifsc.edu.br");
    expect(guessEmail("   ", "P7", none)).toBe("docente.p7@ifsc.edu.br");
    expect(guessEmail("— ?", "*12", none)).toBe("docente.12@ifsc.edu.br");
  });

  test("colisão ganha sufixo 2, depois 3", () => {
    const taken = new Set(["ana.silva@ifsc.edu.br"]);
    expect(guessEmail("Ana Silva", "P1", taken)).toBe("ana.silva2@ifsc.edu.br");
    taken.add("ana.silva2@ifsc.edu.br");
    expect(guessEmail("Ana Souza Silva", "P2", taken)).toBe("ana.silva3@ifsc.edu.br");
    expect(guessEmail("", "P7", new Set(["docente.p7@ifsc.edu.br"]))).toBe(
      "docente.p72@ifsc.edu.br",
    );
  });

  test("resultado é sempre um e-mail válido", () => {
    for (const name of ["Ana Silva", "", "Ñ", "x".repeat(400), "a b c d e", "@,'\"`$\\ José"]) {
      const email = guessEmail(name, "id com espaço", new Set());
      expect(isValidEmail(email)).toBe(true);
      expect(email.endsWith("@ifsc.edu.br")).toBe(true);
    }
  });
});
