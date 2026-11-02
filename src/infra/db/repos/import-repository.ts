import { and, asc, desc, eq, gt, inArray, lt, type SQL, sql } from "drizzle-orm";
import type { ImportRepository, RowFilter } from "#/application/ports";
import type {
  ImportBatch,
  ImportBatchStatus,
  ImportRow,
  ImportRowCounts,
  ImportRowStatus,
  ImportSummary,
} from "#/domain/import-batch";
import { runAtomically, type Statement } from "#/infra/db/atomic";
import type { AppDb } from "#/infra/db/client";
import { importBatches, importRows, occupations, spaces } from "#/infra/db/schema";

const EMPTY_COUNTS: ImportRowCounts = {
  pendente: 0,
  aplicada: 0,
  nao_aplicavel: 0,
  conflito: 0,
  conflito_interno: 0,
  falha: 0,
};

const OPEN: ImportRowStatus[] = ["pendente", "falha"];
const DRAFT: ImportBatchStatus[] = ["preparando", "rascunho"];

function rowInsert(x: AppDb, row: ImportRow) {
  return x
    .insert(importRows)
    .values({
      batchId: row.batchId,
      rowKey: row.rowKey,
      lessonId: row.lessonId,
      weekday: row.weekday,
      spaceId: row.spaceId,
      date: row.date,
      startTime: row.startTime,
      endTime: row.endTime,
      title: row.title,
      responsibleUserId: row.responsibleUserId,
      status: row.status,
      reasonCode: row.reasonCode,
      reasonDetail: row.reasonDetail,
      occupationId: row.occupationId,
      conflictOccupationId: row.conflictOccupationId,
    })
    .onConflictDoNothing();
}

const ESCAPE = "\\";

/** Escapa `%`, `_` e a barra invertida para uso em `LIKE ... ESCAPE`. */
function likePattern(search: string): string {
  return `%${search.replace(/[\\%_]/g, (char) => ESCAPE + char)}%`;
}

function rowWhere(batchId: string, filter: RowFilter): SQL {
  const parts: SQL[] = [eq(importRows.batchId, batchId)];
  if (filter.status !== undefined) parts.push(eq(importRows.status, filter.status));
  if (filter.reasonCode !== undefined) parts.push(eq(importRows.reasonCode, filter.reasonCode));
  const term = filter.search?.trim();
  if (term !== undefined && term !== "") {
    const pattern = likePattern(term);
    parts.push(
      sql`(${importRows.title} LIKE ${pattern} ESCAPE ${ESCAPE}
        OR ${importRows.reasonDetail} LIKE ${pattern} ESCAPE ${ESCAPE}
        OR ${importRows.spaceId} IN (SELECT ${spaces.id} FROM ${spaces}
          WHERE ${spaces.name} LIKE ${pattern} ESCAPE ${ESCAPE}))`,
    );
  }
  return and(...parts) as SQL;
}

function parseSummary(json: string): ImportSummary {
  const parsed = JSON.parse(json) as Partial<ImportSummary>;
  return {
    rows: parsed.rows ?? 0,
    notApplicable: parsed.notApplicable ?? {},
    counts: { ...EMPTY_COUNTS, ...parsed.counts },
  };
}

function toBatch(row: typeof importBatches.$inferSelect): ImportBatch {
  return {
    id: row.id,
    semesterId: row.semesterId,
    fileHash: row.fileHash,
    summary: parseSummary(row.summaryJson),
    planHash: row.planHash,
    status: row.status,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    appliedAt: row.appliedAt,
  };
}

/**
 * Gravação de lotes e ocupações importadas. Sem `db.transaction()`: cada bloco usa
 * `runAtomically` (batch no D1, transação no bun:sqlite) e cada linha é uma instrução com
 * poucos parâmetros (o D1 limita 100 por instrução).
 */
export function createImportRepository(db: AppDb): ImportRepository {
  return {
    async findBatch(id) {
      const [row] = await db.select().from(importBatches).where(eq(importBatches.id, id));
      return row ? toBatch(row) : null;
    },
    async findBatchByHash(semesterId, fileHash) {
      const [row] = await db
        .select()
        .from(importBatches)
        .where(and(eq(importBatches.semesterId, semesterId), eq(importBatches.fileHash, fileHash)));
      return row ? toBatch(row) : null;
    },
    async insertBatch(batch) {
      await db
        .insert(importBatches)
        .values({
          id: batch.id,
          semesterId: batch.semesterId,
          fileHash: batch.fileHash,
          summaryJson: JSON.stringify(batch.summary),
          planHash: batch.planHash,
          status: batch.status,
          createdBy: batch.createdBy,
          createdAt: batch.createdAt,
          appliedAt: batch.appliedAt,
        })
        .onConflictDoNothing();
    },
    async insertRows(rows) {
      const [first, ...rest] = rows;
      if (first === undefined) return;
      await runAtomically(db, (x) => [rowInsert(x, first), ...rest.map((r) => rowInsert(x, r))]);
    },
    async rowKeys(batchId) {
      const found = await db
        .select({ rowKey: importRows.rowKey })
        .from(importRows)
        .where(eq(importRows.batchId, batchId));
      return found.map((row) => row.rowKey);
    },
    async deleteDraft(id) {
      const open = sql`EXISTS (SELECT 1 FROM import_batches b WHERE b.id = ${id} AND b.status IN ('preparando', 'rascunho'))`;
      await runAtomically(db, (x) => [
        x.delete(importRows).where(and(eq(importRows.batchId, id), open)),
        x
          .delete(importBatches)
          .where(and(eq(importBatches.id, id), inArray(importBatches.status, DRAFT))),
      ]);
    },
    async pendingRows(batchId, limit) {
      return db
        .select()
        .from(importRows)
        .where(and(eq(importRows.batchId, batchId), inArray(importRows.status, OPEN)))
        .orderBy(asc(importRows.rowKey))
        .limit(limit);
    },
    async applyRows(batchId, rows, createdAt) {
      const first = rows[0];
      if (first === undefined) return;
      await runAtomically(db, (x) => {
        const statements: Statement[] = [];
        for (const row of rows) {
          const spaceId = row.spaceId ?? "";
          const startsAt = `${row.date}T${row.startTime}`;
          const endsAt = `${row.date}T${row.endTime}`;
          const overlapping = sql`o.space_id = ${spaceId} AND o.status = 'ativa'
            AND o.starts_at < ${endsAt} AND o.ends_at > ${startsAt}`;
          // Insere só se nenhuma ocupação ativa se sobrepõe; a chave única torna repetir inofensivo.
          statements.push(
            x
              .insert(occupations)
              .select(
                sql`SELECT ${crypto.randomUUID()}, ${spaceId}, ${startsAt}, ${endsAt}, 'import',
                  ${batchId}, ${row.lessonId}, ${row.responsibleUserId}, ${row.title}, 'ativa',
                  ${createdAt}
                  WHERE NOT EXISTS (SELECT 1 FROM occupations o WHERE ${overlapping})`,
              )
              .onConflictDoNothing(),
          );
          const own = sql`SELECT o.id FROM occupations o WHERE o.batch_id = ${batchId}
            AND o.lesson_id = ${row.lessonId} AND o.space_id = ${spaceId}
            AND o.starts_at = ${startsAt}`;
          const open = and(
            eq(importRows.batchId, batchId),
            eq(importRows.rowKey, row.rowKey),
            inArray(importRows.status, OPEN),
          );
          statements.push(
            x
              .update(importRows)
              .set({
                status: "aplicada",
                reasonCode: null,
                reasonDetail: null,
                occupationId: sql`(${own})`,
              })
              .where(and(open, sql`EXISTS (${own})`)),
            x
              .update(importRows)
              .set({
                status: "conflito",
                reasonCode: "conflito_concorrente",
                reasonDetail: "Outra ocupação ativa passou a ocupar este espaço e horário.",
                conflictOccupationId: sql`(SELECT o.id FROM occupations o WHERE ${overlapping}
                  ORDER BY o.starts_at LIMIT 1)`,
              })
              .where(open),
          );
        }
        return statements as [Statement, ...Statement[]];
      });
    },
    async markFailed(batchId, rowKeys, code, detail) {
      if (rowKeys.length === 0) return;
      await db
        .update(importRows)
        .set({ status: "falha", reasonCode: code, reasonDetail: detail })
        .where(
          and(
            eq(importRows.batchId, batchId),
            inArray(importRows.rowKey, [...rowKeys]),
            inArray(importRows.status, OPEN),
          ),
        );
    },
    async transition(id, from, to) {
      const changed = await db
        .update(importBatches)
        .set({
          status: to.status,
          ...(to.summary === undefined ? {} : { summaryJson: JSON.stringify(to.summary) }),
          ...(to.appliedAt === undefined ? {} : { appliedAt: to.appliedAt }),
        })
        .where(and(eq(importBatches.id, id), inArray(importBatches.status, [...from])))
        .returning({ id: importBatches.id });
      return changed.length > 0;
    },
    async countRows(batchId) {
      const grouped = await db
        .select({ status: importRows.status, total: sql<number>`count(*)` })
        .from(importRows)
        .where(eq(importRows.batchId, batchId))
        .groupBy(importRows.status);
      const counts = { ...EMPTY_COUNTS };
      for (const entry of grouped) counts[entry.status] = Number(entry.total);
      return counts;
    },
    async listRows(batchId, options) {
      return db
        .select()
        .from(importRows)
        .where(rowWhere(batchId, options))
        .orderBy(
          sql`${importRows.date} IS NULL`,
          asc(importRows.date),
          asc(importRows.startTime),
          asc(importRows.rowKey),
        )
        .limit(options.limit)
        .offset(options.offset);
    },
    async countFilteredRows(batchId, filter) {
      const [found] = await db
        .select({ total: sql<number>`count(*)` })
        .from(importRows)
        .where(rowWhere(batchId, filter));
      return Number(found?.total ?? 0);
    },
    async reasonCounts(batchId) {
      const grouped = await db
        .select({
          status: importRows.status,
          reasonCode: importRows.reasonCode,
          total: sql<number>`count(*)`,
        })
        .from(importRows)
        .where(eq(importRows.batchId, batchId))
        .groupBy(importRows.status, importRows.reasonCode);
      return grouped.map((entry) => ({ ...entry, total: Number(entry.total) }));
    },
    async listBatches(limit) {
      const found = await db
        .select()
        .from(importBatches)
        .orderBy(desc(importBatches.createdAt), desc(importBatches.id))
        .limit(limit);
      return found.map(toBatch);
    },
    async describeOccupations(ids) {
      if (ids.length === 0) return [];
      return db
        .select({
          id: occupations.id,
          spaceId: occupations.spaceId,
          startsAt: occupations.startsAt,
          endsAt: occupations.endsAt,
          title: occupations.title,
          batchId: occupations.batchId,
        })
        .from(occupations)
        .where(inArray(occupations.id, [...ids]));
    },
    async listActiveOccupations(from, to) {
      return db
        .select({
          id: occupations.id,
          spaceId: occupations.spaceId,
          startsAt: occupations.startsAt,
          endsAt: occupations.endsAt,
        })
        .from(occupations)
        .where(
          and(
            eq(occupations.status, "ativa"),
            lt(occupations.startsAt, to),
            gt(occupations.endsAt, from),
          ),
        );
    },
  };
}
