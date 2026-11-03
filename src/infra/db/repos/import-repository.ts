import {
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  gt,
  gte,
  inArray,
  lt,
  lte,
  ne,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import type { ImportRepository, RowFilter } from "#/application/ports";
import { CANCEL_REASONS } from "#/domain/cancel-reasons";
import {
  EMPTY_COUNTS,
  type ImportBatch,
  type ImportBatchStatus,
  type ImportRow,
  type ImportRowStatus,
  type ImportSummary,
} from "#/domain/import-batch";
import { runAtomically, type Statement } from "#/infra/db/atomic";
import type { AppDb } from "#/infra/db/client";
import { importBatches, importRows, occupations, spaces } from "#/infra/db/schema";

const OPEN: ImportRowStatus[] = ["pendente", "falha", "cancelar", "responsavel"];
/** Prefixos de `row_key` das linhas de mudança (cancelar e trocar o responsável). */
const CANCEL_PREFIX = "c:";
const RESPONSIBLE_PREFIX = "r:";
const CANCEL_REASON = CANCEL_REASONS.novaVersao;
const ALREADY_CANCELLED = "ja_cancelada";
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
      changeKind: row.changeKind,
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
  if (filter.changeKind !== undefined) parts.push(eq(importRows.changeKind, filter.changeKind));
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
    ...(parsed.version === undefined ? {} : { version: parsed.version }),
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
    supersedesBatchId: row.supersedesBatchId,
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
    async findBatches(ids) {
      if (ids.length === 0) return [];
      const found = await db
        .select()
        .from(importBatches)
        .where(inArray(importBatches.id, [...ids]));
      return found.map(toBatch);
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
          supersedesBatchId: batch.supersedesBatchId,
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
    async discardBatch(id) {
      const noWork = sql`NOT EXISTS (SELECT 1 FROM import_rows r WHERE r.batch_id = ${id}
        AND r.status IN ('aplicada', 'cancelada_versao', 'responsavel_atualizado'))
        AND NOT EXISTS (SELECT 1 FROM occupations o WHERE o.batch_id = ${id})`;
      const discardable = sql`EXISTS (SELECT 1 FROM import_batches b WHERE b.id = ${id}
        AND (b.status IN ('preparando', 'rascunho') OR (b.status = 'falhou' AND ${noWork})))`;
      await runAtomically(db, (x) => [
        x.delete(importRows).where(and(eq(importRows.batchId, id), discardable)),
        x
          .delete(importBatches)
          .where(
            and(
              eq(importBatches.id, id),
              sql`(${importBatches.status} IN ('preparando', 'rascunho') OR (${importBatches.status} = 'falhou' AND ${noWork}))`,
            ),
          ),
      ]);
      const [left] = await db
        .select({ id: importBatches.id })
        .from(importBatches)
        .where(eq(importBatches.id, id));
      return left === undefined;
    },
    async findInProgressBatch(semesterId) {
      const [row] = await db
        .select()
        .from(importBatches)
        .where(
          and(
            eq(importBatches.semesterId, semesterId),
            inArray(importBatches.status, ["aplicando", "falhou"]),
          ),
        )
        .limit(1);
      return row ? toBatch(row) : null;
    },
    async claimForApply(id) {
      const claimed = await db
        .update(importBatches)
        .set({ status: "aplicando", appliedAt: null })
        .where(
          and(
            eq(importBatches.id, id),
            inArray(importBatches.status, ["rascunho", "falhou"]),
            sql`NOT EXISTS (SELECT 1 FROM import_batches o
              WHERE o.semester_id = ${importBatches.semesterId} AND o.id <> ${importBatches.id}
                AND o.status IN ('aplicando', 'falhou'))`,
            sql`(SELECT l.id FROM import_batches l WHERE l.semester_id = ${importBatches.semesterId}
              AND l.status = 'aplicado'
              ORDER BY l.applied_at DESC, l.created_at DESC, l.id DESC LIMIT 1)
              IS ${importBatches.supersedesBatchId}`,
          ),
        )
        .returning({ id: importBatches.id });
      if (claimed.length > 0) return "ok";
      const [batch] = await db.select().from(importBatches).where(eq(importBatches.id, id));
      if (batch === undefined || (batch.status !== "rascunho" && batch.status !== "falhou")) {
        return "changed";
      }
      const [other] = await db
        .select({ id: importBatches.id })
        .from(importBatches)
        .where(
          and(
            eq(importBatches.semesterId, batch.semesterId),
            ne(importBatches.id, id),
            inArray(importBatches.status, ["aplicando", "falhou"]),
          ),
        )
        .limit(1);
      return other === undefined ? "stale" : "busy";
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
    async pendingRows(batchId, limit, phase) {
      const isChange = sql`(${importRows.rowKey} LIKE ${`${CANCEL_PREFIX}%`}
        OR ${importRows.rowKey} LIKE ${`${RESPONSIBLE_PREFIX}%`})`;
      const open =
        phase === "mudancas"
          ? or(
              inArray(importRows.status, ["cancelar", "responsavel"]),
              and(eq(importRows.status, "falha"), isChange),
            )
          : or(
              eq(importRows.status, "pendente"),
              and(eq(importRows.status, "falha"), sql`NOT ${isChange}`),
            );
      return db
        .select()
        .from(importRows)
        .where(and(eq(importRows.batchId, batchId), open))
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
                  ${createdAt}, NULL, NULL
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
    async applyVersionRows(batchId, rows, now) {
      const first = rows[0];
      if (first === undefined) return;
      await runAtomically(db, (x) => {
        const statements: Statement[] = [];
        for (const row of rows) {
          const occupationId = row.occupationId ?? "";
          const open = and(
            eq(importRows.batchId, batchId),
            eq(importRows.rowKey, row.rowKey),
            inArray(importRows.status, OPEN),
          );
          // Só ocupações importadas e ainda ativas: reserva avulsa nunca é tocada.
          const importedActive = and(
            eq(occupations.id, occupationId),
            eq(occupations.status, "ativa"),
            eq(occupations.source, "import"),
          );
          if (row.rowKey.startsWith(RESPONSIBLE_PREFIX)) {
            const done = sql`EXISTS (SELECT 1 FROM occupations o WHERE o.id = ${occupationId}
              AND o.status = 'ativa' AND o.source = 'import')`;
            statements.push(
              x
                .update(occupations)
                .set({ responsibleUserId: row.responsibleUserId })
                .where(importedActive),
              x
                .update(importRows)
                .set({
                  status: "responsavel_atualizado",
                  reasonCode: sql`CASE WHEN ${done} THEN NULL ELSE ${ALREADY_CANCELLED} END`,
                  reasonDetail: sql`CASE WHEN ${done} THEN NULL
                    ELSE 'A ocupação já não estava ativa; o responsável não foi alterado.' END`,
                })
                .where(open),
            );
            continue;
          }
          const done = sql`EXISTS (SELECT 1 FROM occupations o WHERE o.id = ${occupationId}
            AND o.cancel_reason = ${CANCEL_REASON} AND o.cancelled_at = ${now})`;
          statements.push(
            x
              .update(occupations)
              .set({ status: "cancelada", cancelReason: CANCEL_REASON, cancelledAt: now })
              .where(importedActive),
            x
              .update(importRows)
              .set({
                status: "cancelada_versao",
                // Feito agora: mantém o motivo planejado (ex.: sala ignorada); senão, já estava cancelada.
                reasonCode: sql`CASE WHEN ${done} THEN ${importRows.reasonCode} ELSE ${ALREADY_CANCELLED} END`,
                reasonDetail: sql`CASE WHEN ${done} THEN ${importRows.reasonDetail}
                  ELSE 'A ocupação já estava cancelada quando a nova versão foi aplicada.' END`,
              })
              .where(open),
          );
        }
        return statements as [Statement, ...Statement[]];
      });
    },
    async latestAppliedBatchId(semesterId) {
      const [found] = await db
        .select({ id: importBatches.id })
        .from(importBatches)
        .where(and(eq(importBatches.semesterId, semesterId), eq(importBatches.status, "aplicado")))
        .orderBy(
          desc(importBatches.appliedAt),
          desc(importBatches.createdAt),
          desc(importBatches.id),
        )
        .limit(1);
      return found?.id ?? null;
    },
    async listVersionOccupations(semesterId, from, to) {
      return db
        .select({
          id: occupations.id,
          spaceId: occupations.spaceId,
          startsAt: occupations.startsAt,
          endsAt: occupations.endsAt,
          title: occupations.title,
          lessonId: occupations.lessonId,
          responsibleUserId: occupations.responsibleUserId,
          status: occupations.status,
        })
        .from(occupations)
        .innerJoin(importBatches, eq(occupations.batchId, importBatches.id))
        .where(
          and(
            eq(importBatches.semesterId, semesterId),
            eq(importBatches.status, "aplicado"),
            eq(occupations.source, "import"),
            // Cancelada por uma nova versão é história, não parte da versão vigente.
            sql`NOT (${occupations.status} = 'cancelada' AND COALESCE(${occupations.cancelReason}, '') = ${CANCEL_REASON})`,
            gte(occupations.startsAt, from),
            lt(occupations.startsAt, to),
          ),
        );
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
    async listRowGroups(batchId, options) {
      const ranked = db
        .select({
          ...getTableColumns(importRows),
          rank: sql<number>`dense_rank() over (order by ${importRows.date} is null, ${importRows.date}, ${importRows.title})`.as(
            "grp_rank",
          ),
        })
        .from(importRows)
        .where(rowWhere(batchId, options))
        .as("ranked");
      const found = await db
        .select()
        .from(ranked)
        .where(
          and(gt(ranked.rank, options.offset), lte(ranked.rank, options.offset + options.limit)),
        )
        .orderBy(sql`grp_rank`, asc(ranked.startTime), asc(ranked.rowKey));
      return found.map(({ rank: _rank, ...row }) => row);
    },
    async countRowGroups(batchId, filter) {
      const groups = db
        .select({ date: importRows.date, title: importRows.title })
        .from(importRows)
        .where(rowWhere(batchId, filter))
        .groupBy(importRows.date, importRows.title)
        .as("grupos");
      const [found] = await db.select({ total: sql<number>`count(*)` }).from(groups);
      return Number(found?.total ?? 0);
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
