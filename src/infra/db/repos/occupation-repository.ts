import { and, asc, eq, gt, gte, lt, or, sql } from "drizzle-orm";
import type { OutboxWrite } from "#/application/email-ports";
import type { OccupationRecord, OccupationRepository } from "#/application/ports";
import { weekdaySqlite } from "#/domain/availability";
import { runAtomically, runAtomicWrites, type Statement } from "#/infra/db/atomic";
import type { AppDb } from "#/infra/db/client";
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
  async function writeWithMail(build: (x: AppDb) => Statement, job: OutboxWrite | null) {
    const counts = await runAtomicWrites(db, (x) =>
      job === null ? [build(x)] : [build(x), outboxWrite(x, job)],
    );
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

    async cancelOne(id, reason, at) {
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

    async cancelSeries(anchor, fromLocal, onlyResponsible, reason, at) {
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
      );
      return changed;
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
