import { sql } from "drizzle-orm";
import { index, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { users } from "./schema-users";

/**
 * Pedido de sala entre professores: uma data e um horário de uma ocupação de outra pessoa.
 * `occupation_id` não é chave estrangeira para evitar ciclo entre os arquivos do esquema; as
 * ocupações nunca são apagadas.
 */
export const roomRequests = sqliteTable(
  "room_requests",
  {
    id: text("id").primaryKey(),
    occupationId: text("occupation_id").notNull(),
    requesterId: text("requester_id")
      .notNull()
      .references(() => users.id),
    /** Cópia do dono no momento do pedido. */
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id),
    purpose: text("purpose").notNull(),
    message: text("message"),
    status: text("status", {
      enum: ["pendente", "aceito", "recusado", "cancelado", "encerrado"],
    }).notNull(),
    decisionNote: text("decision_note"),
    createdAt: text("created_at").notNull(),
    decidedAt: text("decided_at"),
    newOccupationId: text("new_occupation_id"),
  },
  (table) => [
    index("room_requests_owner_idx").on(table.ownerId, table.status, table.createdAt),
    index("room_requests_requester_idx").on(table.requesterId, table.createdAt),
    uniqueIndex("room_requests_pending_unique")
      .on(table.occupationId, table.requesterId)
      .where(sql`${table.status} = 'pendente'`),
  ],
);

/** Aviso para uma pessoa; `data_json` guarda o texto no momento (ver `NoticeData`). */
export const notifications = sqliteTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    kind: text("kind", {
      enum: ["reserva_cancelada", "pedido_recebido", "pedido_aceito", "pedido_recusado"],
    }).notNull(),
    actorId: text("actor_id").references(() => users.id),
    occupationId: text("occupation_id"),
    requestId: text("request_id"),
    dataJson: text("data_json").notNull(),
    createdAt: text("created_at").notNull(),
    readAt: text("read_at"),
  },
  (table) => [index("notifications_user_idx").on(table.userId, table.readAt, table.createdAt)],
);
