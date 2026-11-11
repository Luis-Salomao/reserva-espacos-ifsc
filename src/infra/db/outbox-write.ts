import { getTableColumns, type SQL, sql } from "drizzle-orm";
import type { OutboxWrite } from "#/application/email-ports";
import type { AppDb } from "#/infra/db/client";
import { mailOutbox } from "#/infra/db/schema-email";

/** INSERT condicional imediatamente após a mutação, na mesma transação/conexão. */
export function outboxWrite(db: AppDb, job: OutboxWrite, condition: SQL = sql`changes() > 0`) {
  const values = Object.entries(getTableColumns(mailOutbox)).map(([key, column]) =>
    key in job ? sql`${job[key as keyof OutboxWrite]}` : sql`${column.default ?? null}`,
  );
  return db.insert(mailOutbox).select(sql`SELECT ${sql.join(values, sql`, `)} WHERE ${condition}`);
}
