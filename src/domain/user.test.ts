import { describe, expect, test } from "bun:test";
import { isRole, parseRoles, serializeRoles } from "./user";

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
