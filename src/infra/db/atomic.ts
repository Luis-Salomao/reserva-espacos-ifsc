import type { AppDb } from "#/infra/db/client";

/** Instrução do drizzle ainda não executada (aguardável; no bun:sqlite também tem `run()` síncrono). */
export type Statement = PromiseLike<unknown>;

type Batchable = { batch(statements: [Statement, ...Statement[]]): Promise<unknown> };
type SyncStatement = Statement & { run(): unknown };
type Transactional = { transaction(run: (tx: AppDb) => void): void };

function hasBatch(db: AppDb): db is AppDb & Batchable {
  return typeof (db as Partial<Batchable>).batch === "function";
}

function isSync(statement: Statement): statement is SyncStatement {
  return typeof (statement as Partial<SyncStatement>).run === "function";
}

/**
 * Executa as instruções como uma unidade: tudo ou nada.
 *
 * - D1: `db.batch(...)`, que o D1 executa em transação implícita.
 * - bun:sqlite (síncrono): `db.transaction(...)` do drizzle, rodando as instruções com `run()`;
 *   qualquer erro desfaz tudo.
 *
 * `build` recebe o executor a usar e devolve as instruções já ligadas a ele (no bun:sqlite o
 * executor é a transação). Este é o único lugar que conhece a diferença entre os dois alvos;
 * domínio e aplicação nunca veem transações.
 */
export async function runAtomically(
  db: AppDb,
  build: (executor: AppDb) => [Statement, ...Statement[]],
): Promise<void> {
  if (hasBatch(db)) {
    await db.batch(build(db));
    return;
  }
  (db as unknown as Transactional).transaction((tx) => {
    for (const statement of build(tx)) {
      if (!isSync(statement))
        throw new Error("Driver síncrono sem run(): transação não suportada.");
      statement.run();
    }
  });
}
