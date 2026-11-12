import { getTableColumns, type SQL, sql } from "drizzle-orm";
import type { NewNotification } from "#/application/ports";
import type { AppDb } from "#/infra/db/client";
import { notifications } from "#/infra/db/schema";

/**
 * INSERT condicional do aviso: grava só se `condition` vale, na mesma transação da mutação que o
 * motiva. Os valores seguem a ordem das colunas do esquema, derivada dele (como `outboxWrite`).
 */
export function notificationWrite(db: AppDb, notice: NewNotification, condition: SQL) {
  const values: Record<keyof typeof notifications.$inferInsert, string | null> = {
    id: notice.id,
    userId: notice.userId,
    kind: notice.kind,
    actorId: notice.actorId,
    occupationId: notice.occupationId,
    requestId: notice.requestId,
    dataJson: JSON.stringify(notice.data),
    createdAt: notice.createdAt,
    readAt: null,
  };
  const list = (Object.keys(getTableColumns(notifications)) as Array<keyof typeof values>).map(
    (key) => sql`${values[key]}`,
  );
  return db.insert(notifications).select(sql`SELECT ${sql.join(list, sql`, `)} WHERE ${condition}`);
}
