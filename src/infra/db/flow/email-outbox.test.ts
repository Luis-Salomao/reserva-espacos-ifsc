import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { createOutboxProcessor } from "#/application/email-outbox";
import { createOutboxRepository } from "#/infra/db/repos/outbox-repository";
import * as schema from "#/infra/db/schema";
import { mailOutbox } from "#/infra/db/schema-email";

const now = "2026-11-09T15:00:00.000Z";
function setup() {
  const sqlite = new Database(":memory:");
  sqlite.exec(
    readFileSync(new URL("../../../../drizzle/0011_email_outbox.sql", import.meta.url), "utf8"),
  );
  const db = drizzle(sqlite, { schema });
  return { sqlite, db, repo: createOutboxRepository(db) };
}
const write = {
  id: "mail-1",
  payload: "encrypted",
  createdAt: now,
  expiresAt: "2026-11-09T15:20:00.000Z",
};

test("inserção direta usa defaults e lease rejeita worker antigo", async () => {
  const { db, sqlite, repo } = setup();
  await db.insert(mailOutbox).values(write);
  const [a, b] = await Promise.all([
    repo.claim(now, "2026-11-09T15:01:00.000Z", "a"),
    repo.claim(now, "2026-11-09T15:01:00.000Z", "b"),
  ]);
  expect([a, b].filter(Boolean)).toHaveLength(1);
  expect(
    (await repo.claim("2026-11-09T15:02:00.000Z", "2026-11-09T15:03:00.000Z", "new"))?.attempts,
  ).toBe(2);
  expect(await repo.sent(write.id, a?.token ?? "b", "2026-11-09T15:02:00.000Z")).toBe(false);
  expect(await repo.sent(write.id, "new", "2026-11-09T15:02:00.000Z")).toBe(true);
  expect(sqlite.query("select payload, status from mail_outbox").get()).toEqual({
    payload: null,
    status: "sent",
  });
  sqlite.close();
});

test("dispatcher respeita backoff e reusa idempotência após falha", async () => {
  const { sqlite, repo } = setup();
  await repo.enqueue(write);
  let current = now;
  const keys: string[] = [];
  const processor = createOutboxProcessor({
    outbox: repo,
    codec: {
      seal: async () => "",
      open: async () => ({ to: "a@b.com", subject: "S", text: "secret" }),
    },
    sender: {
      send: async (_message, key) => {
        keys.push(key);
        if (keys.length === 1) throw new Error("raw-token-secret");
      },
    },
    now: () => new Date(current),
  });
  expect(await processor.drain()).toEqual({ sent: 0, failed: 1 });
  expect(await processor.drain()).toEqual({ sent: 0, failed: 0 });
  current = "2026-11-09T15:01:00.000Z";
  expect(await processor.drain()).toEqual({ sent: 1, failed: 0 });
  expect(keys).toEqual([write.id, write.id]);
  expect(sqlite.query("select payload from mail_outbox").get()).toEqual({ payload: null });
  sqlite.close();
});

test("limite de tentativas, expiração e limpeza apagam o payload", async () => {
  const { sqlite, repo } = setup();
  await repo.enqueue(write);
  for (let i = 0; i < 5; i++) {
    expect(await repo.claim(now, now, String(i))).not.toBeNull();
    await repo.retry(write.id, String(i), now, now);
  }
  expect(await repo.claim(now, now, "again")).toBeNull();
  expect(sqlite.query("select payload, status from mail_outbox").get()).toEqual({
    payload: null,
    status: "failed",
  });
  await repo.enqueue({ ...write, id: "expired" });
  await repo.cleanup("2026-11-09T15:20:00.000Z");
  expect(sqlite.query("select payload, status from mail_outbox where id='expired'").get()).toEqual({
    payload: null,
    status: "expired",
  });
  await repo.cleanup("2026-11-18T15:20:00.000Z");
  expect(sqlite.query("select count(*) as n from mail_outbox").get()).toEqual({ n: 0 });
  sqlite.close();
});

test("mensagem que expira durante a decifragem não chega ao provedor", async () => {
  const { sqlite, repo } = setup();
  await repo.enqueue(write);
  let current = now;
  let sends = 0;
  const processor = createOutboxProcessor({
    outbox: repo,
    codec: {
      seal: async () => "",
      open: async () => {
        current = write.expiresAt;
        return { to: "a@b.com", subject: "S", text: "secret" };
      },
    },
    sender: {
      send: async () => {
        sends++;
      },
    },
    now: () => new Date(current),
  });
  await processor.drain();
  expect(sends).toBe(0);
  expect(sqlite.query("select payload, status from mail_outbox").get()).toEqual({
    payload: null,
    status: "expired",
  });
  sqlite.close();
});
