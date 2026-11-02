import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { runAtomically, type Statement } from "#/infra/db/atomic";
import type { AppDb } from "#/infra/db/client";
import * as schema from "#/infra/db/schema";

function open() {
  const sqlite = new Database(":memory:");
  sqlite.run(
    "CREATE TABLE spaces (id text primary key not null, name text not null unique, capacity integer, created_at text not null)",
  );
  return drizzle(sqlite, { schema });
}

const row = (id: string, name: string) => ({ id, name, capacity: null, createdAt: "x" });

describe("runAtomically (bun:sqlite)", () => {
  test("grava todas as instruções", async () => {
    const db = open();
    await runAtomically(db, (x) => [
      x.insert(schema.spaces).values(row("1", "A")),
      x.insert(schema.spaces).values(row("2", "B")),
    ]);
    expect(await db.select().from(schema.spaces)).toHaveLength(2);
  });

  test("falha no meio desfaz tudo, inclusive o que veio antes", async () => {
    const db = open();
    await db.insert(schema.spaces).values(row("0", "Antiga"));
    await expect(
      runAtomically(db, (x) => [
        x.delete(schema.spaces),
        x.insert(schema.spaces).values(row("1", "A")),
        x.insert(schema.spaces).values(row("2", "A")),
      ]),
    ).rejects.toThrow();
    expect((await db.select().from(schema.spaces)).map((r) => r.name)).toEqual(["Antiga"]);
  });

  test("recusa instrução sem run() em driver síncrono", async () => {
    const db = open();
    const fake: Statement = Promise.resolve();
    await expect(runAtomically(db, () => [fake])).rejects.toThrow("transação não suportada");
  });
});

describe("runAtomically (com batch, como no D1)", () => {
  test("entrega todas as instruções a db.batch de uma vez", async () => {
    const db = open();
    const sizes: number[] = [];
    const withBatch = Object.assign(db, {
      async batch(statements: Statement[]) {
        sizes.push(statements.length);
        return Promise.all(statements);
      },
    }) as AppDb;
    await runAtomically(withBatch, (x) => [
      x.insert(schema.spaces).values(row("1", "A")),
      x.insert(schema.spaces).values(row("2", "B")),
    ]);
    expect(sizes).toEqual([2]);
  });
});
