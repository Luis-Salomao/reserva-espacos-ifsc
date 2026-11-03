import { and, asc, eq, gt, gte, lt, or, sql } from "drizzle-orm";
import type { OccupationRecord, OccupationRepository } from "#/application/ports";
import { weekdaySqlite } from "#/domain/availability";
import type { AppDb } from "#/infra/db/client";
import { occupations, spaces } from "#/infra/db/schema";

const columns = {
  id: occupations.id,
  spaceId: occupations.spaceId,
  startsAt: occupations.startsAt,
  endsAt: occupations.endsAt,
  source: occupations.source,
  batchId: occupations.batchId,
  responsibleUserId: occupations.responsibleUserId,
  createdBy: occupations.createdBy,
  title: occupations.title,
  status: occupations.status,
};

/** Série da âncora: mesmo lote, título, espaço, dia da semana e horário, ativas, de `fromLocal` em diante. */
function seriesCondition(anchor: OccupationRecord, fromLocal: string) {
  const startTime = anchor.startsAt.slice(11, 16);
  const endTime = anchor.endsAt.slice(11, 16);
  const weekday = weekdaySqlite(anchor.startsAt.slice(0, 10));
  const sameSeries =
    anchor.batchId === null
      ? sql`0`
      : and(
          eq(occupations.batchId, anchor.batchId),
          eq(occupations.title, anchor.title),
          gte(occupations.startsAt, fromLocal),
          sql`substr(${occupations.startsAt}, 12, 5) = ${startTime}`,
          sql`substr(${occupations.endsAt}, 12, 5) = ${endTime}`,
          sql`CAST(strftime('%w', substr(${occupations.startsAt}, 1, 10)) AS INTEGER) = ${weekday}`,
        );
  return and(
    eq(occupations.status, "ativa"),
    eq(occupations.spaceId, anchor.spaceId),
    or(eq(occupations.id, anchor.id), sameSeries),
  );
}

// Sem db.transaction(): cada operação de escrita é uma única instrução (atômica nos dois alvos).
export function createOccupationRepository(db: AppDb): OccupationRepository {
  return {
    async listActiveInRange(spaceId, from, to) {
      return db
        .select(columns)
        .from(occupations)
        .where(
          and(
            eq(occupations.spaceId, spaceId),
            eq(occupations.status, "ativa"),
            lt(occupations.startsAt, to),
            gt(occupations.endsAt, from),
          ),
        )
        .orderBy(asc(occupations.startsAt), asc(occupations.id));
    },

    async findById(id) {
      const [row] = await db.select(columns).from(occupations).where(eq(occupations.id, id));
      return row ?? null;
    },

    async insertManualIfFree(input) {
      const overlapping = sql`o.space_id = ${input.spaceId} AND o.status = 'ativa'
        AND o.starts_at < ${input.endsAt} AND o.ends_at > ${input.startsAt}`;
      // Uma única instrução: a checagem de sobreposição e a inserção são atômicas, então de duas
      // reservas concorrentes conflitantes só uma é gravada (mesmo padrão da aplicação da importação).
      const inserted = await db
        .insert(occupations)
        .select(
          sql`SELECT ${input.id}, ${input.spaceId}, ${input.startsAt}, ${input.endsAt}, 'manual',
            NULL, NULL, ${input.createdBy}, ${input.title}, 'ativa', ${input.createdAt}, NULL, NULL,
            ${input.createdBy}
            WHERE NOT EXISTS (SELECT 1 FROM occupations o WHERE ${overlapping})`,
        )
        .returning({ id: occupations.id });
      if (inserted.length > 0) return { inserted: true };
      const [blocking] = await db
        .select({
          title: occupations.title,
          startsAt: occupations.startsAt,
          endsAt: occupations.endsAt,
        })
        .from(occupations)
        .where(
          and(
            eq(occupations.spaceId, input.spaceId),
            eq(occupations.status, "ativa"),
            lt(occupations.startsAt, input.endsAt),
            gt(occupations.endsAt, input.startsAt),
          ),
        )
        .orderBy(asc(occupations.startsAt))
        .limit(1);
      return { inserted: false, blocking: blocking ?? null };
    },

    async cancelOne(id, reason, at) {
      const changed = await db
        .update(occupations)
        .set({ status: "cancelada", cancelReason: reason, cancelledAt: at })
        .where(and(eq(occupations.id, id), eq(occupations.status, "ativa")))
        .returning({ id: occupations.id });
      return changed.length > 0;
    },

    async seriesDates(anchor, fromLocal) {
      const rows = await db
        .select({ startsAt: occupations.startsAt })
        .from(occupations)
        .where(seriesCondition(anchor, fromLocal))
        .orderBy(asc(occupations.startsAt));
      return rows.map((row) => row.startsAt.slice(0, 10));
    },

    async cancelSeries(anchor, fromLocal, reason, at) {
      const changed = await db
        .update(occupations)
        .set({ status: "cancelada", cancelReason: reason, cancelledAt: at })
        .where(seriesCondition(anchor, fromLocal))
        .returning({ id: occupations.id });
      return changed.length;
    },

    async listMine(userId, fromLocal, limit, offset) {
      return db
        .select({ ...columns, spaceName: spaces.name })
        .from(occupations)
        .innerJoin(spaces, eq(spaces.id, occupations.spaceId))
        .where(
          and(
            eq(occupations.status, "ativa"),
            gt(occupations.endsAt, fromLocal),
            or(eq(occupations.createdBy, userId), eq(occupations.responsibleUserId, userId)),
          ),
        )
        .orderBy(asc(occupations.startsAt), asc(occupations.id))
        .limit(limit)
        .offset(offset);
    },
  };
}
