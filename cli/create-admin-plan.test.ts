import { describe, expect, test } from "bun:test";
import { escapeSqlLiteral, planCreateAdmin, shellDoubleQuote } from "./create-admin-plan.ts";

const base = {
  email: " Ana@IFSC.edu.br ",
  name: "Ana Souza",
  code: "ANA",
  passwordHash: "scrypt$16384$8$1$c2FsdA==$aGFzaA==",
  target: "cloudflare" as const,
  id: "11111111-1111-4111-8111-111111111111",
  now: "2026-11-02T12:00:00.000Z",
};

describe("escapeSqlLiteral", () => {
  test("dobra aspas simples", () => {
    expect(escapeSqlLiteral("O'Brien")).toBe("'O''Brien'");
    expect(escapeSqlLiteral("a''b")).toBe("'a''''b'");
  });
});

describe("shellDoubleQuote", () => {
  test("protege $, aspas, crase, barra e !", () => {
    expect(shellDoubleQuote('a$b"c`d\\e!f')).toBe('"a\\$b\\"c\\`d\\\\e\\!f"');
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
    expect(command).toContain("'Ana D''Ávila'");
    expect(command).toContain("scrypt\\$16384\\$8\\$1\\$c2FsdA==\\$aGFzaA==");
    expect(command).toContain("'ana@ifsc.edu.br'");
    expect(command).toContain("'admin'");
    expect(command).toContain("INSERT INTO users");
    expect(command).toContain(`'${base.id}'`);
    expect(command).toContain(`'${base.now}'`);
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
