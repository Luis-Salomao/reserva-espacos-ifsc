import { describe, expect, test } from "bun:test";
import { isRole, isValidEmail, normalizeEmail, parseRoles, serializeRoles } from "./user";

describe("papéis", () => {
  test("reconhece os quatro papéis, incluindo manutencao", () => {
    expect(isRole("admin")).toBe(true);
    expect(isRole("horarios")).toBe(true);
    expect(isRole("docente")).toBe(true);
    expect(isRole("manutencao")).toBe(true);
    expect(isRole("outro")).toBe(false);
  });

  test("parseRoles lê manutencao de uma lista separada por vírgula", () => {
    expect(parseRoles("admin,manutencao")).toEqual(["admin", "manutencao"]);
  });

  test("parseRoles descarta papéis desconhecidos (menor privilégio)", () => {
    expect(parseRoles("manutencao,bixo-voador")).toEqual(["manutencao"]);
  });

  test("parseRoles continua lendo contas antigas sem manutencao (texto armazenado inalterado)", () => {
    expect(parseRoles("docente")).toEqual(["docente"]);
    expect(parseRoles("")).toEqual([]);
  });

  test("serializeRoles grava manutencao como texto simples (sem migração: papéis são texto)", () => {
    expect(serializeRoles(["admin", "manutencao"])).toBe("admin,manutencao");
  });
});

describe("papéis: lista e serialização", () => {
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
