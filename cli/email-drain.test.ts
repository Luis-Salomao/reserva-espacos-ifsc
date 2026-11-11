import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import { resetDbCache } from "#/infra/db/client.local";
import { passwordResets, users } from "#/infra/db/schema";
import { drainEmailOutbox, getEmailContext } from "#/server/email-context";
import { runEmailDrain } from "./email-drain";

test("composição habilitada monta codec e outbox real e drena banco vazio sem enviar", async () => {
  const configured = {
    EMAIL_PROVIDER: "resend",
    RESEND_API_KEY: "fake-test-key",
    EMAIL_FROM: "reservas@example.invalid",
    PUBLIC_ORIGIN: "https://reservas.example.invalid",
    EMAIL_PAYLOAD_KEY: "A".repeat(43),
    DEPLOY_TARGET: "local",
    DATABASE_PATH: join(mkdtempSync(join(tmpdir(), "mail-context-")), "app.sqlite"),
  };
  const previous = new Map(Object.keys(configured).map((key) => [key, process.env[key]]));
  resetDbCache();
  try {
    Object.assign(process.env, configured);
    const context = getEmailContext();
    if (context === null) throw new Error("Contexto de e-mail ausente");
    const message = { to: "qa@example.invalid", subject: "Teste", text: "Mensagem fictícia" };
    expect(await context.codec.open(await context.codec.seal(message))).toEqual(message);
    expect(await drainEmailOutbox()).toEqual({ sent: 0, failed: 0 });
    expect(getTableConfig(passwordResets).foreignKeys[0]?.reference().foreignTable).toBe(users);
  } finally {
    resetDbCache();
    for (const [key, value] of previous) {
      if (value === undefined) Reflect.deleteProperty(process.env, key);
      else process.env[key] = value;
    }
  }
});

test("modo disabled não exige banco, não acessa rede e CLI aceita rodada única", async () => {
  const previous = process.env.EMAIL_PROVIDER;
  process.env.EMAIL_PROVIDER = "disabled";
  try {
    expect(getEmailContext()).toBeNull();
    expect(await drainEmailOutbox()).toEqual({ sent: 0, failed: 0 });
    expect(await runEmailDrain(["--once"])).toBe(0);
    expect(await runEmailDrain(["--invalid"])).toBe(1);
    process.env.EMAIL_PROVIDER = "invalid";
    expect(await runEmailDrain(["--once"])).toBe(1);
  } finally {
    if (previous === undefined) Reflect.deleteProperty(process.env, "EMAIL_PROVIDER");
    else process.env.EMAIL_PROVIDER = previous;
  }
});
