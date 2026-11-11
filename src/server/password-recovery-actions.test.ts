import { expect, test } from "bun:test";
import { createPasswordRecoveryService, RECOVERY_MESSAGE } from "#/application/password-recovery";
import { requestPasswordRecovery, resetPassword } from "#/server/password-recovery-actions";

const disabled = createPasswordRecoveryService({
  email: null,
  users: {} as never,
  repository: {} as never,
  tokens: {} as never,
  hasher: {} as never,
  clock: { now: () => new Date() },
});

test("recuperação responde genericamente para corpo inválido, desabilitado e erro interno", async () => {
  for (const data of [null, {}, { email: 42 }, { email: "a@example.org" }])
    expect(await requestPasswordRecovery(disabled, data, "client")).toEqual({
      ok: true,
      data: { message: RECOVERY_MESSAGE },
    });
  expect(
    await requestPasswordRecovery(
      {
        ...disabled,
        request: async () => {
          throw new Error("não expor");
        },
      },
      { email: "a@example.org" },
      "client",
    ),
  ).toEqual({ ok: true, data: { message: RECOVERY_MESSAGE } });
});

test("reset valida corpo e não revela token, senha ou erro interno", async () => {
  for (const data of [
    null,
    {},
    { token: 42, password: "long-password" }, // betterleaks:allow
    { token: "x".repeat(101), password: "long-password" }, // betterleaks:allow
    { token: "x".repeat(43), password: "x".repeat(1025) }, // betterleaks:allow
  ])
    expect(await resetPassword(disabled, data)).toMatchObject({ ok: false, status: 400 });
  const response = await resetPassword(
    {
      ...disabled,
      reset: async () => {
        throw new Error("segredo interno");
      },
    },
    { token: "x".repeat(43), password: "long-password" }, // betterleaks:allow
  );
  expect(response).toMatchObject({ ok: false, status: 400 });
  expect(JSON.stringify(response)).not.toContain("segredo interno");
  expect(JSON.stringify(response)).not.toContain("long-password");
});
