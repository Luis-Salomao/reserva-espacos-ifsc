import { expect, test } from "bun:test";
import { createPasswordRecoveryService, RECOVERY_MESSAGE } from "#/application/password-recovery";
import { recoveryTokens } from "#/infra/auth/recovery-tokens";
import { createPasswordRecoveryRepository } from "#/infra/db/repos/password-recovery-repository";
import { createSessionRepository } from "#/infra/db/repos/session-repository";
import { createUserRepository } from "#/infra/db/repos/user-repository";
import { createEmailPayloadCodec } from "#/infra/email/payload-codec";
import { openDb, rawAll, seed } from "../../../../test/booking-env";

async function setup() {
  const { db } = openDb();
  const s = await seed(db);
  const codec = createEmailPayloadCodec("A".repeat(43));
  let now = new Date("2026-11-09T12:00:00Z");
  let hashCalls = 0;
  const svc = createPasswordRecoveryService({
    users: createUserRepository(db),
    repository: createPasswordRecoveryRepository(db),
    hasher: {
      hash: async (p) => {
        hashCalls++;
        return `hash:${p}`;
      },
      verify: async () => false,
      needsRehash: () => false,
    },
    tokens: recoveryTokens,
    clock: { now: () => now },
    email: { publicOrigin: "https://reservas.example.org", codec },
  });
  return {
    db,
    s,
    codec,
    svc,
    hashCalls: () => hashCalls,
    setNow: (value: string) => {
      now = new Date(value);
    },
  };
}

test("token cifrado na outbox, hash no banco, uso único e revogação das sessões", async () => {
  const { db, s, codec, svc } = await setup();
  for (const user of [s.docA, s.docB])
    await createSessionRepository(db).create({
      id: user.id,
      userId: user.id,
      tokenHash: user.id,
      createdAt: "2026-11-09T12:00:00Z",
      expiresAt: "2026-11-10T12:00:00Z",
      lastSeenAt: "2026-11-09T12:00:00Z",
    });
  expect(await svc.request(s.docA.email, "c1")).toEqual({ message: RECOVERY_MESSAGE });
  const mail = rawAll(db, "SELECT payload FROM mail_outbox")[0] as { payload: string };
  const message = await codec.open(mail.payload);
  const token = /#token=([A-Za-z0-9_-]+)/.exec(message.text)?.[1];
  if (!token) throw new Error("sem token");
  expect(JSON.stringify(rawAll(db, "SELECT * FROM password_resets"))).not.toContain(token);
  expect(mail.payload).not.toContain(token);
  expect(message.text).toContain("https://reservas.example.org/redefinir-senha#token=");
  const reset = await svc.reset(token, "nova-senha-segura");
  expect(reset).toMatchObject({ ok: true });
  expect(rawAll(db, "SELECT user_id FROM sessions")).toEqual([{ user_id: s.docB.id }]);
  expect((await createUserRepository(db).findByEmail(s.docA.email))?.passwordHash).toBe(
    "hash:nova-senha-segura",
  );
  expect(await svc.reset(token, "outra-senha-segura")).toMatchObject({ ok: false });
  expect(await svc.reset("x".repeat(43), "outra-senha-segura")).toMatchObject({ ok: false });
});

test("tokens aleatórios não executam KDF e limite por cliente antecede mesmo um token válido", async () => {
  const { db, s, svc, codec, hashCalls } = await setup();
  for (let i = 0; i < 35; i++)
    expect(
      await svc.reset(String(i).padStart(43, "a"), "senha-segura-nova", "abusivo"),
    ).toMatchObject({ ok: false });
  expect(hashCalls()).toBe(0);
  expect(rawAll(db, "SELECT * FROM password_recovery_requests")).toHaveLength(20);
  await svc.request(s.docA.email, "normal");
  const mail = rawAll(db, "SELECT payload FROM mail_outbox")[0] as { payload: string };
  const token = /#token=([A-Za-z0-9_-]+)/.exec((await codec.open(mail.payload)).text)?.[1];
  if (!token) throw new Error("sem token");
  expect(await svc.reset(token, "senha-segura-nova", "abusivo")).toMatchObject({ ok: false });
  expect(hashCalls()).toBe(0);
  expect(await svc.reset(token, "senha-segura-nova", "normal")).toMatchObject({ ok: true });
  expect(hashCalls()).toBe(1);
});

test("contas inativas e fantasmas têm resposta genérica e não recebem token; FK física rejeita usuário ausente", async () => {
  const { db, s, svc } = await setup();
  rawAll(db, `UPDATE users SET active = 0 WHERE id = '${s.docA.id}' RETURNING id`);
  rawAll(db, `UPDATE users SET placeholder = 1 WHERE id = '${s.docB.id}' RETURNING id`);
  expect(await svc.request(s.docA.email, "c1")).toEqual({ message: RECOVERY_MESSAGE });
  expect(await svc.request(s.docB.email, "c2")).toEqual({ message: RECOVERY_MESSAGE });
  expect(rawAll(db, "SELECT * FROM password_resets")).toHaveLength(0);
  expect(rawAll(db, "SELECT * FROM mail_outbox")).toHaveLength(0);
  expect(() =>
    rawAll(
      db,
      "INSERT INTO password_resets(id,user_id,token_hash,created_at,expires_at) VALUES('x','ausente','hash','a','z') RETURNING id",
    ),
  ).toThrow();
});

test("rate limit por cliente é persistente e concorrência não excede limite por e-mail", async () => {
  const { db, s, svc } = await setup();
  for (let i = 0; i < 25; i++) await svc.request(`ausente${i}@example.org`, "cliente");
  expect(rawAll(db, "SELECT * FROM password_recovery_requests")).toHaveLength(20);
  await svc.request(s.docA.email, "cliente");
  expect(rawAll(db, "SELECT * FROM mail_outbox")).toHaveLength(0);
  await Promise.all(Array.from({ length: 12 }, (_, i) => svc.request(s.docA.email, `novo-${i}`)));
  expect(rawAll(db, "SELECT * FROM mail_outbox")).toHaveLength(5);
});

test("falha na atualização da senha desfaz consumo e tokens irmãos deixam de funcionar após sucesso", async () => {
  const { db, s, svc, codec } = await setup();
  await svc.request(s.docA.email, "c1");
  await svc.request(s.docA.email, "c1");
  const mails = rawAll(db, "SELECT payload FROM mail_outbox ORDER BY rowid") as {
    payload: string;
  }[];
  const tokens = await Promise.all(
    mails.map(
      async (m) => /#token=([A-Za-z0-9_-]+)/.exec((await codec.open(m.payload)).text)?.[1] ?? "",
    ),
  );
  const [first, second] = tokens;
  if (!first || !second) throw new Error("sem tokens");
  rawAll(
    db,
    "CREATE TRIGGER fail_reset BEFORE UPDATE OF password_hash ON users BEGIN SELECT RAISE(ABORT, 'falha simulada'); END",
  );
  await expect(svc.reset(first, "nova-senha-segura")).rejects.toThrow();
  expect(rawAll(db, "SELECT consumed_at FROM password_resets")).toEqual([
    { consumed_at: null },
    { consumed_at: null },
  ]);
  rawAll(db, "DROP TRIGGER fail_reset");
  expect(await svc.reset(first, "nova-senha-segura")).toMatchObject({ ok: true });
  expect(await svc.reset(second, "outra-senha-segura")).toMatchObject({ ok: false });
});

test("expiração no limite, senha curta e corrida de consumo", async () => {
  const { db, s, codec, svc, setNow } = await setup();
  await svc.request(s.docA.email, "c1");
  const mail = rawAll(db, "SELECT payload FROM mail_outbox")[0] as { payload: string };
  const token = /#token=([A-Za-z0-9_-]+)/.exec((await codec.open(mail.payload)).text)?.[1];
  if (!token) throw new Error("sem token");
  expect(await svc.reset(token, "curta")).toMatchObject({ ok: false, field: "password" });
  setNow("2026-11-09T12:20:00Z");
  expect(await svc.reset(token, "nova-senha-segura")).toMatchObject({ ok: false });
  setNow("2026-11-09T12:19:59Z");
  const result = await Promise.all([
    svc.reset(token, "senha-segura-1"),
    svc.reset(token, "senha-segura-2"),
  ]);
  expect(result.filter((r) => r.ok)).toHaveLength(1);
});

test("anonimato e rate limit persistente por e-mail e cliente sem bloquear login", async () => {
  const { db, s, svc } = await setup();
  expect(await svc.request("desconhecido@example.org", "c1")).toEqual({
    message: RECOVERY_MESSAGE,
  });
  expect(rawAll(db, "SELECT * FROM mail_outbox")).toHaveLength(0);
  for (let i = 0; i < 8; i++) await svc.request(s.docA.email, `client-${i}`);
  expect(rawAll(db, "SELECT * FROM mail_outbox")).toHaveLength(5);
  expect(rawAll(db, "SELECT * FROM login_attempts")).toHaveLength(0);
});
