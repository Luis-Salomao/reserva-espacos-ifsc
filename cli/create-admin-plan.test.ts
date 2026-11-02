import { describe, expect, test } from "bun:test";
import {
  escapeSqlLiteral,
  planCreateAdmin,
  powershellQuote,
  shellSingleQuote,
} from "./create-admin-plan.ts";

const base = {
  email: " Ana@IFSC.edu.br ",
  name: "Ana Souza",
  code: "ANA",
  passwordHash: "scrypt$16384$8$1$c2FsdA==$aGFzaA==",
  target: "cloudflare" as const,
  shell: "posix" as const,
  id: "11111111-1111-4111-8111-111111111111",
  now: "2026-11-02T12:00:00.000Z",
};

describe("escapeSqlLiteral", () => {
  test("dobra aspas simples", () => {
    expect(escapeSqlLiteral("O'Brien")).toBe("'O''Brien'");
    expect(escapeSqlLiteral("a''b")).toBe("'a''''b'");
  });
});

describe("quoting de shell", () => {
  test("POSIX: aspas simples, com ' virando '\\''", () => {
    expect(shellSingleQuote("a$b\"c'd!")).toBe(String.raw`'a$b"c'\''d!'`);
  });

  test("PowerShell: aspas simples dobradas", () => {
    expect(powershellQuote("a$b'c\"")).toBe("'a$b''c\"'");
  });
});

describe("planCreateAdmin", () => {
  test("normaliza email e monta a linha do admin", () => {
    const plan = planCreateAdmin({ ...base, target: "local" });
    if (!plan.ok) throw new Error(plan.errors.join(","));
    expect(plan.row).toEqual({
      email: "ana@ifsc.edu.br",
      name: "Ana Souza",
      code: "ANA",
      roles: ["admin"],
      passwordHash: base.passwordHash,
    });
    expect(plan.command).toBeUndefined();
  });

  test("cloudflare imprime comando wrangler com hash e escapes, sem senha", () => {
    const plan = planCreateAdmin({ ...base, name: "Ana D'Ávila" });
    if (!plan.ok) throw new Error(plan.errors.join(","));
    expect(plan.command).toBeDefined();
    const command = plan.command ?? "";
    expect(
      command.startsWith("wrangler d1 execute DB --remote --config wrangler.jsonc --command "),
    ).toBe(true);
    // SQL: aspas simples dobradas; shell: $ do hash escapado
    expect(command).toContain("'Ana D'\\'''\\''Ávila'");
    expect(command).toContain("scrypt$16384$8$1$c2FsdA==$aGFzaA==");
    expect(command).toContain("--command 'INSERT INTO users");
    expect(command).toContain(String.raw`'\''ana@ifsc.edu.br'\''`);
    expect(command).toContain(String.raw`'\''admin'\''`);
    expect(command).toContain(String.raw`'\''${base.id}'\''`);
    expect(command).toContain(String.raw`'\''${base.now}'\''`);
    expect(command).not.toContain('"');
  });

  test("shell powershell dobra as aspas simples e não usa barra invertida", () => {
    const plan = planCreateAdmin({ ...base, name: "Ana D'Ávila", shell: "powershell" });
    if (!plan.ok) throw new Error(plan.errors.join(","));
    expect(plan.command).toContain("--command 'INSERT INTO users");
    expect(plan.command).toContain("Ana D''''Ávila");
    expect(plan.command).toContain("scrypt$16384$8$1$");
    expect(plan.command).not.toContain("\\");
  });

  test("sigla ausente vira NULL", () => {
    const plan = planCreateAdmin({ ...base, code: undefined });
    if (!plan.ok) throw new Error(plan.errors.join(","));
    expect(plan.row.code).toBeNull();
    expect(plan.command).toContain("NULL");
  });

  test("rejeita email inválido, nome vazio, sigla inválida e controle", () => {
    const bad = planCreateAdmin({ ...base, email: "sem-arroba", name: " ", code: "A B" });
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.errors).toHaveLength(3);
    const ctrl = planCreateAdmin({ ...base, name: "Ana\nDROP" });
    expect(ctrl.ok).toBe(false);
  });

  test("rejeita hash vazio ou com caracteres fora do formato", () => {
    expect(planCreateAdmin({ ...base, passwordHash: "" }).ok).toBe(false);
    expect(planCreateAdmin({ ...base, passwordHash: "x'; DROP TABLE users;--" }).ok).toBe(false);
  });
});

describe("powershellQuote com aspas tipográficas", () => {
  test("dobra também U+2018 a U+201B (o PowerShell as trata como aspas simples)", () => {
    for (const quote of ["‘", "’", "‚", "‛"]) {
      expect(powershellQuote(`a${quote}b`)).toBe(`'a${quote}${quote}b'`);
    }
  });
});
