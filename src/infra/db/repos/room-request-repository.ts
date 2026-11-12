import { and, asc, desc, eq, getTableColumns, gt, type SQL, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import type { NewNotification, RoomRequestRepository } from "#/application/ports";
import { runAtomicWrites } from "#/infra/db/atomic";
import type { AppDb } from "#/infra/db/client";
import { notificationWrite } from "#/infra/db/notification-write";
import { occupations, roomRequests, spaces, users } from "#/infra/db/schema";

const requester = alias(users, "requester");
const owner = alias(users, "owner");

const rowColumns = {
  id: roomRequests.id,
  occupationId: roomRequests.occupationId,
  requesterId: roomRequests.requesterId,
  ownerId: roomRequests.ownerId,
  purpose: roomRequests.purpose,
  message: roomRequests.message,
  status: roomRequests.status,
  decisionNote: roomRequests.decisionNote,
  createdAt: roomRequests.createdAt,
  decidedAt: roomRequests.decidedAt,
  newOccupationId: roomRequests.newOccupationId,
  requesterName: requester.name,
  ownerName: owner.name,
  spaceName: spaces.name,
  startsAt: occupations.startsAt,
  endsAt: occupations.endsAt,
  occupationStatus: occupations.status,
};

/** Pedidos com pessoas, sala e ocupação; dono e quem pediu vêm de duas junções da mesma tabela. */
function selectRows(db: AppDb) {
  return db
    .select(rowColumns)
    .from(roomRequests)
    .innerJoin(requester, eq(requester.id, roomRequests.requesterId))
    .innerJoin(owner, eq(owner.id, roomRequests.ownerId))
    .innerJoin(occupations, eq(occupations.id, roomRequests.occupationId))
    .innerJoin(spaces, eq(spaces.id, occupations.spaceId));
}

function pendingBy(occupationId: string, requesterId: string) {
  return and(
    eq(roomRequests.occupationId, occupationId),
    eq(roomRequests.requesterId, requesterId),
    eq(roomRequests.status, "pendente"),
  );
}

export function createRoomRequestRepository(db: AppDb): RoomRequestRepository {
  async function hasPending(occupationId: string, requesterId: string): Promise<boolean> {
    const [found] = await db
      .select({ id: roomRequests.id })
      .from(roomRequests)
      .where(pendingBy(occupationId, requesterId))
      .limit(1);
    return found !== undefined;
  }

  /** Muda o pedido numa instrução; com aviso, grava-o na mesma unidade se a mudança valeu. */
  async function transition(
    set: Partial<typeof roomRequests.$inferInsert>,
    where: SQL | undefined,
    notice?: { notice: NewNotification; condition: SQL },
  ) {
    const counts = await runAtomicWrites(db, (x) => {
      const update = x.update(roomRequests).set(set).where(where);
      return notice === undefined
        ? [update]
        : [update, notificationWrite(x, notice.notice, notice.condition)];
    });
    return (counts[0] ?? 0) > 0;
  }

  return {
    async create(input) {
      if (await hasPending(input.occupationId, input.requesterId)) return false;
      try {
        await runAtomicWrites(db, (x) => [
          x.insert(roomRequests).values({
            id: input.id,
            occupationId: input.occupationId,
            requesterId: input.requesterId,
            ownerId: input.ownerId,
            purpose: input.purpose,
            message: input.message,
            status: "pendente",
            decisionNote: null,
            createdAt: input.createdAt,
            decidedAt: null,
            newOccupationId: null,
          }),
          notificationWrite(
            x,
            input.notice,
            sql`EXISTS (SELECT 1 FROM room_requests WHERE id = ${input.id})`,
          ),
        ]);
      } catch (error) {
        // Corrida entre dois pedidos iguais: o índice único parcial barra o segundo (e o aviso).
        if (await hasPending(input.occupationId, input.requesterId)) return false;
        throw error;
      }
      return true;
    },

    async findById(id) {
      const [row] = await selectRows(db).where(eq(roomRequests.id, id)).limit(1);
      return row ?? null;
    },

    listIncoming(ownerId) {
      return selectRows(db)
        .where(and(eq(roomRequests.ownerId, ownerId), eq(roomRequests.status, "pendente")))
        .orderBy(asc(roomRequests.createdAt), asc(roomRequests.id));
    },

    listOutgoing(requesterId, limit) {
      return selectRows(db)
        .where(eq(roomRequests.requesterId, requesterId))
        .orderBy(desc(roomRequests.createdAt), desc(roomRequests.id))
        .limit(limit);
    },

    async countPendingIncoming(ownerId, nowLocal) {
      const [row] = await db
        .select({ total: sql<number>`count(*)` })
        .from(roomRequests)
        .innerJoin(occupations, eq(occupations.id, roomRequests.occupationId))
        .where(
          and(
            eq(roomRequests.ownerId, ownerId),
            eq(roomRequests.status, "pendente"),
            eq(occupations.status, "ativa"),
            gt(occupations.endsAt, nowLocal),
          ),
        );
      return Number(row?.total ?? 0);
    },

    decline(input) {
      return transition(
        { status: "recusado", decisionNote: input.note, decidedAt: input.at },
        and(
          eq(roomRequests.id, input.requestId),
          eq(roomRequests.ownerId, input.ownerId),
          eq(roomRequests.status, "pendente"),
        ),
        {
          notice: input.notice,
          condition: sql`EXISTS (SELECT 1 FROM room_requests WHERE id = ${input.requestId}
            AND status = 'recusado' AND decided_at = ${input.at})`,
        },
      );
    },

    withdraw(requestId, requesterId, at) {
      return transition(
        { status: "cancelado", decidedAt: at },
        and(
          eq(roomRequests.id, requestId),
          eq(roomRequests.requesterId, requesterId),
          eq(roomRequests.status, "pendente"),
        ),
      );
    },

    async accept(input) {
      const { requestId, newOccupationId: newId, at } = input;
      const o = (column: string) => sql.raw(`o.${column}`);
      const r = (column: string) => sql.raw(`r.${column}`);
      // Valores da nova ocupação por coluna do esquema; a ordem vem do próprio esquema.
      const values: Record<keyof typeof occupations.$inferInsert, SQL | string | null> = {
        id: newId,
        spaceId: o("space_id"),
        startsAt: o("starts_at"),
        endsAt: o("ends_at"),
        source: "manual",
        batchId: null,
        lessonId: null,
        responsibleUserId: r("requester_id"),
        title: r("purpose"),
        status: "ativa",
        createdAt: at,
        cancelReason: null,
        cancelledAt: null,
        createdBy: r("requester_id"),
        seriesId: null,
      };
      const list = (Object.keys(getTableColumns(occupations)) as Array<keyof typeof values>).map(
        (key) => sql`${values[key]}`,
      );
      // Cada passo só age se o anterior valeu; um pedido obsoleto não altera nada.
      const counts = await runAtomicWrites(db, (x) => [
        // 1. cancela a ocupação do dono (cedida), com o pedido pendente e a ocupação ainda viva.
        x
          .update(occupations)
          .set({ status: "cancelada", cancelReason: "cedida", cancelledAt: at })
          .where(
            and(
              sql`${occupations.id} = (SELECT occupation_id FROM room_requests
                WHERE id = ${requestId} AND status = 'pendente' AND owner_id = ${input.ownerId})`,
              eq(occupations.status, "ativa"),
              gt(occupations.endsAt, input.nowLocal),
            ),
          ),
        // 2. cria a ocupação de quem pediu, no mesmo espaço e horário.
        x.insert(occupations).select(
          sql`SELECT ${sql.join(list, sql`, `)}
            FROM occupations o JOIN room_requests r ON r.occupation_id = o.id
            WHERE r.id = ${requestId} AND r.status = 'pendente'
              AND o.status = 'cancelada' AND o.cancel_reason = 'cedida' AND o.cancelled_at = ${at}`,
        ),
        // 3. marca o pedido como aceito; a contagem desta instrução é o resultado.
        x
          .update(roomRequests)
          .set({ status: "aceito", decidedAt: at, newOccupationId: newId })
          .where(
            and(
              eq(roomRequests.id, requestId),
              eq(roomRequests.status, "pendente"),
              sql`EXISTS (SELECT 1 FROM occupations WHERE id = ${newId})`,
            ),
          ),
        // 4. encerra os outros pedidos pendentes da mesma ocupação.
        x
          .update(roomRequests)
          .set({ status: "encerrado", decidedAt: at })
          .where(
            and(
              eq(roomRequests.status, "pendente"),
              sql`${roomRequests.occupationId} = (SELECT occupation_id FROM room_requests
                WHERE id = ${requestId} AND status = 'aceito' AND new_occupation_id = ${newId})`,
            ),
          ),
        // 5. avisa quem pediu.
        notificationWrite(
          x,
          input.notice,
          sql`EXISTS (SELECT 1 FROM room_requests WHERE id = ${requestId}
            AND status = 'aceito' AND new_occupation_id = ${newId})`,
        ),
      ]);
      return counts[2] === 1;
    },
  };
}
