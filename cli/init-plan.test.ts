import { describe, expect, test } from "bun:test";
import { planInit } from "./init-plan.ts";

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
      ["bun", "run", "db:migrate:d1:remote"],
      ["bun", "run", "deploy:cf"],
    ]);
    expect(plan.notes.join("\n")).toContain("database_id");
    expect(plan.notes.join("\n")).toContain("wrangler.jsonc");
  });

  test("nenhum arquivo gerado contém chave de segredo", () => {
    for (const target of ["local", "cloudflare"] as const) {
      for (const file of planInit({ target }).files) {
        expect(file.content).not.toMatch(/TOKEN|SECRET|PASSWORD|API_KEY|CLOUDFLARE_/i);
      }
    }
  });
});
