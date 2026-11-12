import { and, desc, eq, isNull, ne, sql } from "drizzle-orm";
import type { NotificationRepository, StoredNotification } from "#/application/ports";
import type { NoticeData } from "#/domain/notification";
import type { AppDb } from "#/infra/db/client";
import { notifications } from "#/infra/db/schema";

type Row = typeof notifications.$inferSelect;

function toStored(row: Row): StoredNotification {
  return {
    id: row.id,
    userId: row.userId,
    kind: row.kind,
    actorId: row.actorId,
    occupationId: row.occupationId,
    requestId: row.requestId,
    data: JSON.parse(row.dataJson) as NoticeData,
    createdAt: row.createdAt,
    readAt: row.readAt,
  };
}

const visible = (userId: string) =>
  and(eq(notifications.userId, userId), ne(notifications.kind, "pedido_recebido"));

export function createNotificationRepository(db: AppDb): NotificationRepository {
  return {
    async listFor(userId, limit) {
      const rows = await db
        .select()
        .from(notifications)
        .where(visible(userId))
        .orderBy(desc(notifications.createdAt), desc(notifications.id))
        .limit(limit);
      return rows.map(toStored);
    },
    async unreadCount(userId) {
      const [row] = await db
        .select({ total: sql<number>`count(*)` })
        .from(notifications)
        .where(and(visible(userId), isNull(notifications.readAt)));
      return Number(row?.total ?? 0);
    },
    async markAllRead(userId, at) {
      await db
        .update(notifications)
        .set({ readAt: at })
        .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
    },
  };
}
