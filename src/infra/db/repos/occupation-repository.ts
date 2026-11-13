import { and, asc, eq, gt, gte, lt, or, sql } from "drizzle-orm";
import type { OutboxWrite } from "#/application/email-ports";
import type { NewNotification, OccupationRecord, OccupationRepository } from "#/application/ports";
import { weekdaySqlite } from "#/domain/availability";
import { runAtomically, runAtomicWrites, type Statement } from "#/infra/db/atomic";
import type { AppDb } from "#/infra/db/client";
import { notificationWrite } from "#/infra/db/notification-write";
import { occupationSelectList } from "#/infra/db/occupation-insert";
import { outboxWrite } from "#/infra/db/outbox-write";
import { occupations, spaces } from "#/infra/db/schema";
import type { BookingEmailFactory } from "#/infra/email/booking-email";

const columns = {
  id: occupations.id,
  spaceId: occupations.spaceId,
  startsAt: occupations.startsAt,
  endsAt: occupations.endsAt,
  source: occupations.source,
  batchId: occupations.batchId,
  lessonId: occupations.lessonId,
  responsibleUserId: occupations.responsibleUserId,
  createdBy: occupations.createdBy,
  title: occupations.title,
  status: occupations.status,
  seriesId: occupations.seriesId,
};

// Ocupações ativas criadas por ou sob responsabilidade do usuário.
function ownedBy(userId: string) {
  return and(
    eq(occupations.status, "ativa"),
    or(eq(occupations.createdBy, userId), eq(occupations.responsibleUserId, userId)),
  );
}

/**
 * Série da âncora (a MESMA condição serve à prévia e ao cancelamento): ocupações ATIVAS da mesma
 * aula (`lesson_id`), lote, espaço, dia da semana e horário de início/fim, com `starts_at >= fromLocal`
 * (o corte é o instante atual em hora de parede: aulas que já começaram não entram, exceto a própria
 * âncora, que sempre entra). `onlyResponsible` (não-admin): só linhas cujo responsável é exatamente
 * esse usuário (`NULL` nunca casa); `null` = admin, a série inteira. Âncora de série recorrente
 * avulsa (`series_id`): as ativas da mesma série com início igual ou posterior ao da âncora ("esta e
 * as próximas"); na avulsa o responsável é quem criou.
 */
function seriesCondition(
  anchor: OccupationRecord,
  fromLocal: string,
  onlyResponsible: string | null,
) {
  const startTime = anchor.startsAt.slice(11, 16);
  const endTime = anchor.endsAt.slice(11, 16);
  const weekday = weekdaySqlite(anchor.startsAt.slice(0, 10));
  const sameSeries =
    anchor.seriesId !== null
      ? and(
          eq(occupations.seriesId, anchor.seriesId),
          gte(occupations.startsAt, anchor.startsAt),
          onlyResponsible === null ? undefined : eq(occupations.responsibleUserId, onlyResponsible),
        )
      : anchor.batchId === null || anchor.lessonId === null
        ? sql`0`
        : and(
            eq(occupations.batchId, anchor.batchId),
            eq(occupations.lessonId, anchor.lessonId),
            gte(occupations.startsAt, fromLocal),
            sql`substr(${occupations.startsAt}, 12, 5) = ${startTime}`,
            sql`substr(${occupations.endsAt}, 12, 5) = ${endTime}`,
            sql`CAST(strftime('%w', substr(${occupations.startsAt}, 1, 10)) AS INTEGER) = ${weekday}`,
            onlyResponsible === null
              ? undefined
              : eq(occupations.responsibleUserId, onlyResponsible),
          );
  return and(
    eq(occupations.status, "ativa"),
    eq(occupations.spaceId, anchor.spaceId),
    or(eq(occupations.id, anchor.id), sameSeries),
  );
}

// Sem db.transaction(): cada escrita é uma única instrução ou passa por `runAtomically` (série).
export function createOccupationRepository(
  db: AppDb,
  email?: BookingEmailFactory,
): OccupationRepository {
  /**
   * Escreve e, na mesma unidade atômica, grava o e-mail do outbox e o aviso (se houver). O aviso só
   * entra se esta chamada cancelou a ocupação `noticeFor` naquele `at` (nunca por outra chamada).
   */
  async function writeWithMail(
    build: (x: AppDb) => Statement,
    job: OutboxWrite | null,
    notice: { notice: NewNotification; occupationId: string; at: string } | null = null,
  ) {
    const counts = await runAtomicWrites(db, (x) => {
      const writes: [Statement, ...Statement[]] = [build(x)];
      if (job !== null) writes.push(outboxWrite(x, job));
      if (notice !== null) {
        writes.push(
          notificationWrite(
            x,
            notice.notice,
            sql`EXISTS (SELECT 1 FROM occupations WHERE id = ${notice.occupationId}
              AND status = 'cancelada' AND cancelled_at = ${notice.at})`,
          ),
        );
      }
      return writes;
    });
    return counts[0] ?? 0;
  }
  return {
    async updateManualIfFree(input) {
      const job =
        (await email?.prepare({
          kind: "updated",
          userId: input.createdBy,
          spaceId: input.spaceId,
          title: input.title,
          slots: [input],
        })) ?? null;
      const changed = await writeWithMail(
        (x) =>
          x
            .update(occupations)
            .set({
              spaceId: input.spaceId,
              startsAt: input.startsAt,
              endsAt: input.endsAt,
              title: input.title,
            })
            .where(
              and(
                eq(occupations.id, input.id),
                eq(occupations.source, "manual"),
                eq(occupations.createdBy, input.createdBy),
                eq(occupations.status, "ativa"),
                gt(occupations.startsAt, input.nowLocal),
                sql`${input.startsAt} > ${input.nowLocal}`,
                sql`NOT EXISTS (SELECT 1 FROM occupations o WHERE o.id <> ${input.id}
            AND o.space_id = ${input.spaceId} AND o.status = 'ativa'
            AND o.starts_at < ${input.endsAt} AND o.ends_at > ${input.startsAt})`,
              ),
            ),
        job,
      );
      return changed > 0;
    },

    async updateManualSeriesIfFree(input) {
      if (input.expected.length === 0 || input.expected.length !== input.updates.length)
        return false;
      const expectedById = new Map(input.expected.map((item) => [item.id, item]));
      if (input.updates.some((item) => !expectedById.has(item.id))) return false;
      const updateById = new Map(input.updates.map((item) => [item.id, item]));
      if (input.expected.some((item) => !updateById.has(item.id))) return false;
      const payload = JSON.stringify(
        input.expected.map((old) => {
          const next = updateById.get(old.id);
          return {
            id: old.id,
            oldSpaceId: old.spaceId,
            oldStartsAt: old.startsAt,
            oldEndsAt: old.endsAt,
            oldTitle: old.title,
            newSpaceId: next?.spaceId,
            newStartsAt: next?.startsAt,
            newEndsAt: next?.endsAt,
            newTitle: next?.title,
          };
        }),
      );
      const eligibleScope =
        input.scope === "future" ? sql`AND s.starts_at >= ${input.anchorStartsAt}` : sql``;
      const eligibleCount = sql`(
        SELECT count(*) FROM occupations s
        WHERE s.series_id = ${input.seriesId}
          AND s.source = 'manual'
          AND s.created_by = ${input.createdBy}
          AND s.status = 'ativa'
          AND s.starts_at > ${input.nowLocal}
          ${eligibleScope}
      ) = ${input.expected.length}`;
      const exactSnapshotCount = sql`(
        SELECT count(*) FROM occupations s
        JOIN json_each(${payload}) j ON json_extract(j.value, '$.id') = s.id
        WHERE s.series_id = ${input.seriesId}
          AND s.source = 'manual'
          AND s.created_by = ${input.createdBy}
          AND s.status = 'ativa'
          AND s.starts_at > ${input.nowLocal}
          ${eligibleScope}
          AND s.space_id = json_extract(j.value, '$.oldSpaceId')
          AND s.starts_at = json_extract(j.value, '$.oldStartsAt')
          AND s.ends_at = json_extract(j.value, '$.oldEndsAt')
          AND s.title = json_extract(j.value, '$.oldTitle')
      ) = ${input.expected.length}`;
      const noConflicts = sql`NOT EXISTS (
        SELECT 1 FROM json_each(${payload}) p
        JOIN occupations o
          ON o.space_id = json_extract(p.value, '$.newSpaceId')
          AND o.status = 'ativa'
          AND o.id NOT IN (SELECT json_extract(value, '$.id') FROM json_each(${payload}))
          AND o.starts_at < json_extract(p.value, '$.newEndsAt')
          AND o.ends_at > json_extract(p.value, '$.newStartsAt')
      )`;
      const newValue = (key: string) =>
        sql`(SELECT json_extract(j.value, ${`$.${key}`}) FROM json_each(${payload}) j
             WHERE json_extract(j.value, '$.id') = ${occupations.id})`;
      const job =
        (await email?.prepare({
          kind: "updated",
          userId: input.createdBy,
          spaceId: input.updates[0]?.spaceId ?? "",
          title: input.updates[0]?.title ?? "",
          slots: input.updates,
          series: true,
        })) ?? null;
      const counts = await runAtomicWrites(db, (x) => [
        x
          .update(occupations)
          .set({
            spaceId: newValue("newSpaceId"),
            startsAt: newValue("newStartsAt"),
            endsAt: newValue("newEndsAt"),
            title: newValue("newTitle"),
          })
          .where(
            and(
              sql`EXISTS (
                SELECT 1 FROM json_each(${payload}) j
                WHERE json_extract(j.value, '$.id') = ${occupations.id}
              )`,
              eq(occupations.seriesId, input.seriesId),
              eq(occupations.source, "manual"),
              eq(occupations.createdBy, input.createdBy),
              eq(occupations.status, "ativa"),
              gt(occupations.startsAt, input.nowLocal),
              ...(input.scope === "future"
                ? [gte(occupations.startsAt, input.anchorStartsAt)]
                : []),
              eligibleCount,
              exactSnapshotCount,
              noConflicts,
            ),
          ),
        ...(job === null ? [] : [outboxWrite(x, job)]),
      ]);
      return counts[0] === input.expected.length;
    },

    async listManualSeriesForUpdate(seriesId, createdBy, fromLocal) {
      return db
        .select(columns)
        .from(occupations)
        .where(
          and(
            eq(occupations.seriesId, seriesId),
            eq(occupations.source, "manual"),
            eq(occupations.createdBy, createdBy),
            eq(occupations.status, "ativa"),
            gt(occupations.startsAt, fromLocal),
          ),
        )
        .orderBy(asc(occupations.startsAt), asc(occupations.id));
    },

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

    async listActiveInRangeAll(from, to) {
      return db
        .select(columns)
        .from(occupations)
        .where(
          and(
            eq(occupations.status, "ativa"),
            lt(occupations.startsAt, to),
            gt(occupations.endsAt, from),
          ),
        )
        .orderBy(asc(occupations.spaceId), asc(occupations.startsAt), asc(occupations.id));
    },

    async listImportedTitles(from, to) {
      return db
        .selectDistinct({
          title: occupations.title,
          responsibleUserId: occupations.responsibleUserId,
        })
        .from(occupations)
        .where(
          and(
            eq(occupations.source, "import"),
            eq(occupations.status, "ativa"),
            lt(occupations.startsAt, to),
            gt(occupations.endsAt, from),
          ),
        );
    },

    async findById(id) {
      const [row] = await db.select(columns).from(occupations).where(eq(occupations.id, id));
      return row ?? null;
    },

    async insertManualIfFree(input) {
      const job =
        (await email?.prepare({
          kind: "created",
          userId: input.createdBy,
          spaceId: input.spaceId,
          title: input.title,
          slots: [input],
        })) ?? null;
      const overlapping = sql`o.space_id = ${input.spaceId} AND o.status = 'ativa'
        AND o.starts_at < ${input.endsAt} AND o.ends_at > ${input.startsAt}`;
      // Uma única instrução: a checagem de sobreposição e a inserção são atômicas, então de duas
      // reservas concorrentes conflitantes só uma é gravada (mesmo padrão da aplicação da importação).
      const inserted = await writeWithMail(
        (x) =>
          x.insert(occupations).select(
            sql`SELECT ${occupationSelectList({
              id: input.id,
              spaceId: input.spaceId,
              startsAt: input.startsAt,
              endsAt: input.endsAt,
              source: "manual",
              batchId: null,
              lessonId: null,
              // O criador também é o responsável: "Minhas reservas" e o 403 usam o mesmo critério das
              // importadas (responsável) e a coluna fica preenchida para quem consulta por responsável.
              responsibleUserId: input.createdBy,
              title: input.title,
              status: "ativa",
              createdAt: input.createdAt,
              cancelReason: null,
              cancelledAt: null,
              createdBy: input.createdBy,
              seriesId: null,
            })}
            WHERE NOT EXISTS (SELECT 1 FROM occupations o WHERE ${overlapping})`,
          ),
        job,
      );
      if (inserted > 0) return { inserted: true };
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

    async insertSeriesIfFree(input) {
      const [first, ...rest] = input.slots;
      if (first === undefined) return false;
      const expected = input.slots.length;
      const job =
        (await email?.prepare({
          kind: "created",
          userId: input.createdBy,
          spaceId: input.spaceId,
          title: input.title,
          slots: input.slots,
          series: true,
        })) ?? null;
      // Cada data é um INSERT condicional (uma instrução por data: o D1 limita 100 parâmetros); a
      // última instrução apaga a série inteira se alguma data não entrou, dentro da mesma unidade.
      const insertSlot = (x: AppDb, slot: typeof first) =>
        x.insert(occupations).select(
          sql`SELECT ${occupationSelectList({
            id: slot.id,
            spaceId: input.spaceId,
            startsAt: slot.startsAt,
            endsAt: slot.endsAt,
            source: "manual",
            batchId: null,
            lessonId: null,
            responsibleUserId: input.createdBy,
            title: input.title,
            status: "ativa",
            createdAt: input.createdAt,
            cancelReason: null,
            cancelledAt: null,
            createdBy: input.createdBy,
            seriesId: input.seriesId,
          })}
            WHERE NOT EXISTS (SELECT 1 FROM occupations o WHERE o.space_id = ${input.spaceId}
              AND o.status = 'ativa' AND o.starts_at < ${slot.endsAt} AND o.ends_at > ${slot.startsAt})`,
        );
      await runAtomically(db, (x) => [
        insertSlot(x, first),
        ...rest.map((slot) => insertSlot(x, slot)),
        x
          .delete(occupations)
          .where(
            and(
              eq(occupations.seriesId, input.seriesId),
              sql`(SELECT count(*) FROM occupations s WHERE s.series_id = ${input.seriesId}) <> ${expected}`,
            ),
          ),
        ...(job === null
          ? []
          : [
              outboxWrite(
                x,
                job,
                sql`(SELECT count(*) FROM occupations s WHERE s.series_id = ${input.seriesId}) = ${expected}`,
              ),
            ]),
      ]);
      const [row] = await db
        .select({ total: sql<number>`count(*)` })
        .from(occupations)
        .where(eq(occupations.seriesId, input.seriesId));
      return row?.total === expected;
    },

    async cancelOne(id, reason, at, notice = null) {
      const [record] =
        email === undefined
          ? []
          : await db.select(columns).from(occupations).where(eq(occupations.id, id));
      const job =
        record?.source === "manual"
          ? ((await email?.prepare({
              kind: "cancelled",
              userId: record.createdBy,
              spaceId: record.spaceId,
              title: record.title,
              slots: [record],
            })) ?? null)
          : null;
      const changed = await writeWithMail(
        (x) =>
          x
            .update(occupations)
            .set({ status: "cancelada", cancelReason: reason, cancelledAt: at })
            .where(
              and(
                eq(occupations.id, id),
                eq(occupations.status, "ativa"),
                record === undefined
                  ? undefined
                  : and(
                      eq(occupations.spaceId, record.spaceId),
                      eq(occupations.startsAt, record.startsAt),
                      eq(occupations.endsAt, record.endsAt),
                      eq(occupations.title, record.title),
                      sql`${occupations.createdBy} IS ${record.createdBy}`,
                    ),
              ),
            ),
        job,
        notice === null ? null : { notice, occupationId: id, at },
      );
      return changed > 0;
    },

    async seriesDates(anchor, fromLocal, onlyResponsible) {
      const rows = await db
        .select({ startsAt: occupations.startsAt })
        .from(occupations)
        .where(seriesCondition(anchor, fromLocal, onlyResponsible))
        .orderBy(asc(occupations.startsAt));
      return rows.map((row) => row.startsAt.slice(0, 10));
    },

    async cancelSeries(anchor, fromLocal, onlyResponsible, reason, at, notice = null) {
      const job =
        anchor.source === "manual"
          ? ((await email?.prepare({
              kind: "cancelled",
              userId: anchor.createdBy,
              spaceId: anchor.spaceId,
              title: anchor.title,
              slots: [anchor],
              series: true,
            })) ?? null)
          : null;
      const changed = await writeWithMail(
        (x) =>
          x
            .update(occupations)
            .set({ status: "cancelada", cancelReason: reason, cancelledAt: at })
            .where(seriesCondition(anchor, fromLocal, onlyResponsible)),
        job,
        notice === null ? null : { notice, occupationId: anchor.id, at },
      );
      return changed;
    },

    async listMine(userId, fromLocal, limit, offset) {
      return db
        .select({ ...columns, spaceName: spaces.name })
        .from(occupations)
        .innerJoin(spaces, eq(spaces.id, occupations.spaceId))
        .where(and(ownedBy(userId), gt(occupations.endsAt, fromLocal)))
        .orderBy(asc(occupations.startsAt), asc(occupations.id))
        .limit(limit)
        .offset(offset);
    },

    async listMineInRange(userId, fromLocal, toLocal) {
      return db
        .select({ ...columns, spaceName: spaces.name })
        .from(occupations)
        .innerJoin(spaces, eq(spaces.id, occupations.spaceId))
        .where(
          and(
            ownedBy(userId),
            gt(occupations.endsAt, fromLocal),
            lt(occupations.startsAt, toLocal),
          ),
        )
        .orderBy(asc(occupations.startsAt), asc(occupations.id));
    },

    async listMineTitles(userId, fromLocal) {
      const rows = await db
        .select({ title: occupations.title })
        .from(occupations)
        .where(and(ownedBy(userId), gt(occupations.endsAt, fromLocal)));
      return rows.map((row) => row.title);
    },
  };
}
