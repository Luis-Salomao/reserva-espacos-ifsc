import { expect, test } from "bun:test";
import { createPasswordRecoveryService, RECOVERY_MESSAGE } from "#/application/password-recovery";

test("disabled recovery is generic and cannot reset a password", async () => {
  const service = createPasswordRecoveryService({
    email: null,
    users: {
      findByEmail: async () => {
        throw new Error("não consultar");
      },
    },
    repository: {} as never,
    hasher: {} as never,
    tokens: {} as never,
    clock: { now: () => new Date() },
  });
  expect(await service.request("a@example.org", "client")).toEqual({ message: RECOVERY_MESSAGE });
  expect(await service.reset("x".repeat(43), "nova-senha-longa")).toMatchObject({ ok: false });
});
