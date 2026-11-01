import { describe, expect, test } from "bun:test";
import { planInit, validateAnswers } from "./init-plan.ts";

describe("planInit", () => {
  test("alvo local gera .env e migra o banco", () => {
    const plan = planInit({ target: "local" });
    expect(plan.files).toEqual([
      {
        path: ".env",
        content:
          "DEPLOY_TARGET=local\nDATABASE_PATH=./data/app.sqlite\nTIMEZONE=America/Sao_Paulo\n",
      },
    ]);
    expect(plan.commands).toEqual([["bun", "run", "db:migrate"]]);
  });

  test("alvo local respeita caminho e fuso informados", () => {
    const plan = planInit({
      target: "local",
      databasePath: "/tmp/x.sqlite",
      timezone: "America/Manaus",
    });
    expect(plan.files[0]?.content).toContain("DATABASE_PATH=/tmp/x.sqlite\n");
    expect(plan.files[0]?.content).toContain("TIMEZONE=America/Manaus\n");
  });

  test("alvo cloudflare gera .dev.vars e comandos do wrangler", () => {
    const plan = planInit({ target: "cloudflare" });
    expect(plan.files).toEqual([{ path: ".dev.vars", content: "TIMEZONE=America/Sao_Paulo\n" }]);
    expect(plan.commands).toEqual([
      ["bunx", "wrangler", "d1", "create", "reserva-espacos"],
      ["bun", "run", "cf:check"],
      ["bun", "run", "build:cf"],
      ["bun", "run", "db:migrate:d1:remote"],
      ["bunx", "wrangler", "deploy"],
    ]);
    expect(plan.notes.join("\n")).toContain("database_id");
    expect(plan.notes.join("\n")).toContain("wrangler.jsonc");
  });

  test("alvo cloudflare verifica o id, compila e só então migra e publica", () => {
    const names = planInit({ target: "cloudflare" }).commands.map((c) => c.join(" "));
    const at = (needle: string) => names.findIndex((n) => n.includes(needle));
    expect(at("d1 create")).toBe(0);
    expect(at("cf:check")).toBeLessThan(at("build:cf"));
    expect(at("build:cf")).toBeLessThan(at("db:migrate:d1:remote"));
    expect(at("build:cf")).toBeLessThan(at("wrangler deploy"));
  });

  test("nenhum arquivo gerado contém chave de segredo", () => {
    for (const target of ["local", "cloudflare"] as const) {
      for (const file of planInit({ target }).files) {
        expect(file.content).not.toMatch(/TOKEN|SECRET|PASSWORD|API_KEY|CLOUDFLARE_/i);
      }
    }
  });
});

describe("validateAnswers", () => {
  const winSpaced = String.raw`C:\meus dados\a.sqlite`;
  const winPlain = String.raw`C:\dados\a.sqlite`;

  test("aceita respostas válidas", () => {
    expect(
      validateAnswers({ target: "local", databasePath: "./a.sqlite", timezone: "America/Manaus" }),
    ).toEqual([]);
  });

  test("rejeita newline (injeção de linhas)", () => {
    expect(validateAnswers({ target: "local", timezone: "UTC\nPUBLIC_READ=false" })).not.toEqual(
      [],
    );
    expect(validateAnswers({ target: "local", databasePath: "a\nX=1" })).not.toEqual([]);
    expect(() => planInit({ target: "local", databasePath: "a\rX=1" })).toThrow();
  });

  test("rejeita fuso inexistente e valores vazios", () => {
    expect(validateAnswers({ target: "local", timezone: "Marte/Olimpo" })).not.toEqual([]);
    expect(validateAnswers({ target: "local", databasePath: "  " })).not.toEqual([]);
    expect(validateAnswers({ target: "cloudflare", timezone: "" })).not.toEqual([]);
  });

  test("rejeita aspas e cifrão", () => {
    expect(validateAnswers({ target: "local", databasePath: 'a"b' })).not.toEqual([]);
    expect(validateAnswers({ target: "local", databasePath: "a$HOME" })).not.toEqual([]);
  });

  test("rejeita barra invertida quando precisaria de aspas", () => {
    expect(validateAnswers({ target: "local", databasePath: winSpaced })).not.toEqual([]);
    expect(validateAnswers({ target: "local", databasePath: winPlain })).toEqual([]);
  });

  test("coloca entre aspas caminho com espaço ou #", () => {
    const plan = planInit({ target: "local", databasePath: "./meus dados/a#1.sqlite" });
    expect(plan.files[0]?.content).toContain('DATABASE_PATH="./meus dados/a#1.sqlite"\n');
  });
});
