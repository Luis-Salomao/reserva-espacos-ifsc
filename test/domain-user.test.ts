import { describe, expect, test } from "bun:test";
import { isValidEmail, normalizeEmail, parseRoles, serializeRoles } from "#/domain/user";

describe("papéis", () => {
  test("lê lista, descarta desconhecidos e duplicados", () => {
    expect(parseRoles("admin, docente,root,admin")).toEqual(["admin", "docente"]);
    expect(parseRoles("")).toEqual([]);
  });

  test("serializa sem duplicados", () => {
    expect(serializeRoles(["horarios", "horarios", "admin"])).toBe("horarios,admin");
  });
});

describe("email", () => {
  test("normaliza para minúsculas sem espaços", () => {
    expect(normalizeEmail("  Ana@IFSC.edu.br ")).toBe("ana@ifsc.edu.br");
  });

  test("valida formato básico e rejeita aspas e espaços", () => {
    expect(isValidEmail("ana@ifsc.edu.br")).toBe(true);
    expect(isValidEmail("ana@ifsc")).toBe(false);
    expect(isValidEmail("a na@ifsc.edu.br")).toBe(false);
    expect(isValidEmail("o'brien@ifsc.edu.br")).toBe(false);
    expect(isValidEmail(`${"a".repeat(250)}@x.br`)).toBe(false);
  });
});
