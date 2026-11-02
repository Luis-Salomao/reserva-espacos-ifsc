import type { ExistingOccupation, PlanInput } from "#/application/import-plan";
import { planImport } from "#/application/import-plan";
import type { VersionOccupation } from "#/application/ports";
import { weekdayOf } from "#/domain/calendar";
import type { ImportChangeKind, ImportRow, VersionSummary } from "#/domain/import-batch";
import { intervalsOverlap } from "#/domain/occupation";
import { diffVersions, type VersionOccurrence } from "#/domain/version-diff";
import {
  existingConflict,
  internalConflict,
  notApplicableRows,
  type OccurrenceDraft,
  occurrenceRow,
  PENDING_INSERT,
} from "./import-rows";

export type VersionPlanInput = Pick<
  PlanInput,
  "preview" | "semester" | "roomMap" | "teacherMap"
> & {
  /** Todas as ocupações ativas do período (a vigente e as demais). */
  active: readonly ExistingOccupation[];
  /** Versão vigente do semestre (ativas e canceladas à mão). */
  current: readonly VersionOccupation[];
  supersedesBatchId: string;
};

export type VersionPlan = { rows: ImportRow[]; version: VersionSummary };

const BLOCKED_DETAIL =
  "A nova versão desta aula conflita com outra ocupação; a versão anterior foi mantida até o conflito ser resolvido.";
const CANCELLED_MOVED = "Cancelada antes; sala ou horário mudou na nova versão.";
const CANCELLED_NO_MATCH =
  "Já estava cancelada e não consta mais na nova versão; continua cancelada.";

const dateOf = (startsAt: string) => startsAt.slice(0, 10);

/** Linha informativa ou de mudança sobre uma ocupação vigente (sem lote). */
function currentRow(
  occupation: VersionOccupation,
  prefix: string,
  status: ImportRow["status"],
  changeKind: ImportChangeKind,
  extra: Partial<ImportRow> = {},
): ImportRow {
  return {
    batchId: "",
    rowKey: `${prefix}:${occupation.id}`,
    lessonId: occupation.lessonId ?? "",
    weekday: weekdayOf(dateOf(occupation.startsAt)),
    spaceId: occupation.spaceId,
    date: dateOf(occupation.startsAt),
    startTime: occupation.startsAt.slice(11),
    endTime: occupation.endsAt.slice(11),
    title: occupation.title,
    responsibleUserId: occupation.responsibleUserId,
    status,
    reasonCode: null,
    reasonDetail: null,
    occupationId: occupation.id,
    conflictOccupationId: null,
    changeKind,
    ...extra,
  };
}

function groupBySpace<T extends { spaceId: string }>(items: readonly T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const list = groups.get(item.spaceId);
    if (list === undefined) groups.set(item.spaceId, [item]);
    else list.push(item);
  }
  return groups;
}

/**
 * Plano da nova versão (puro): o arquivo novo é planejado como na primeira versão, mas tendo como
 * "ocupadas" só as ocupações que NÃO são da versão vigente (reservas avulsas e demais); depois
 * `diffVersions` compara a vigente com as ocorrências do arquivo. Cada diferença vira uma linha:
 * inserir (inclusão/alteração), cancelar (remoção/alteração), trocar responsável, ou informativa
 * (inalterada, mantida cancelada). Uma inserção que cairia sobre ocupação vigente que permanece
 * ativa vira conflito; o que o próprio lote cancela nunca conflita.
 */
export function planVersion(input: VersionPlanInput): VersionPlan {
  const currentIds = new Set(input.current.map((occupation) => occupation.id));
  const others = input.active.filter((occupation) => !currentIds.has(occupation.id));
  const plan = planImport({
    preview: input.preview,
    semester: input.semester,
    roomMap: input.roomMap,
    teacherMap: input.teacherMap,
    existing: others,
  });

  const outcomeOf = new Map<OccurrenceDraft, Parameters<typeof occurrenceRow>[1]>();
  for (const draft of plan.toInsert) outcomeOf.set(draft, PENDING_INSERT);
  for (const { draft, existingId } of plan.conflicts) {
    outcomeOf.set(draft, existingConflict(existingId));
  }
  for (const { draft } of plan.internalConflicts) outcomeOf.set(draft, internalConflict);

  // Todas as ocorrências do arquivo entram na comparação (inclusive as que conflitam): uma
  // ocorrência já aplicada ou cancelada à mão continua valendo, e a conflitante só deixa de ser inserida.
  const draftOf = new Map<VersionOccurrence, OccurrenceDraft>();
  const next: VersionOccurrence[] = [];
  for (const draft of outcomeOf.keys()) {
    const occurrence: VersionOccurrence = {
      lessonKey: draft.title,
      date: dateOf(draft.startsAt),
      spaceId: draft.spaceId,
      startsAt: draft.startsAt,
      endsAt: draft.endsAt,
      responsibleUserId: draft.responsibleUserId,
    };
    draftOf.set(occurrence, draft);
    next.push(occurrence);
  }
  const byId = new Map(input.current.map((occupation) => [occupation.id, occupation]));
  const current: VersionOccurrence[] = input.current.map((occupation) => ({
    lessonKey: occupation.title,
    date: dateOf(occupation.startsAt),
    spaceId: occupation.spaceId,
    startsAt: occupation.startsAt,
    endsAt: occupation.endsAt,
    responsibleUserId: occupation.responsibleUserId,
    occupationId: occupation.id,
    status: occupation.status,
  }));
  const occupationOf = (o: VersionOccurrence) =>
    byId.get(o.occupationId as string) as VersionOccupation;

  const diff = diffVersions(current, next);
  const rows: ImportRow[] = [];
  const affected = new Set<string>();
  const affect = (userId: string | null) => {
    if (userId !== null) affected.add(userId);
  };

  for (const pair of diff.unchanged) {
    rows.push(currentRow(occupationOf(pair.current), "u", "inalterada", "inalterada"));
  }
  const keptCancelled = (o: VersionOccurrence, extra: Partial<ImportRow> = {}) =>
    rows.push(currentRow(occupationOf(o), "k", "mantida_cancelada", "mantida_cancelada", extra));
  for (const pair of diff.keptCancelled) keptCancelled(pair.current);
  const leftover = { reasonCode: "cancelada_sem_correspondente", reasonDetail: CANCELLED_NO_MATCH };
  for (const o of diff.removedAlreadyCancelled) keptCancelled(o, leftover);
  // Cancelada antes cuja sala/horário mudou: a nova ocorrência (pareada) não é inserida.
  for (const pair of diff.movedCancelled) {
    keptCancelled(pair.current, {
      reasonCode: "cancelada_alterada",
      reasonDetail: CANCELLED_MOVED,
    });
  }
  for (const group of diff.changed) {
    for (const o of group.alreadyCancelled) keptCancelled(o, leftover);
  }

  const staying = groupBySpace(
    [...diff.unchanged, ...diff.responsibleChanged].map((pair) => occupationOf(pair.current)),
  );
  const insertRow = (o: VersionOccurrence, changeKind: ImportChangeKind): ImportRow => {
    const draft = draftOf.get(o) as OccurrenceDraft;
    let outcome = outcomeOf.get(draft) as Parameters<typeof occurrenceRow>[1];
    if (outcome === PENDING_INSERT) {
      const blocker = (staying.get(draft.spaceId) ?? []).find((other) =>
        intervalsOverlap(draft, other),
      );
      if (blocker !== undefined) outcome = existingConflict(blocker.id);
    }
    return occurrenceRow(draft, outcome, changeKind);
  };
  const cancelRow = (o: VersionOccurrence, changeKind: ImportChangeKind): ImportRow => {
    const occupation = occupationOf(o);
    affect(occupation.responsibleUserId);
    return currentRow(occupation, "c", "cancelar", changeKind);
  };

  for (const o of diff.added) rows.push(insertRow(o, "inclusao"));
  for (const o of diff.removed) rows.push(cancelRow(o, "remocao"));
  for (const group of diff.changed) {
    const inserts = group.insert.map((o) => insertRow(o, "alteracao"));
    // Se alguma nova ocorrência do grupo já nasce em conflito (com algo que este lote não cancela),
    // o grupo todo fica bloqueado: nada é cancelado nem inserido e a versão anterior continua.
    // Conflito que só aparece na aplicação (fase de inserções, depois dos cancelamentos) é um
    // resíduo aceito: a linha vira conflito concorrente e a aula pode ficar sem sala até resolver.
    const blocked = inserts.some(
      (row) => row.status === "conflito" || row.status === "conflito_interno",
    );
    if (blocked) {
      const hold = { reasonCode: "alteracao_bloqueada", reasonDetail: BLOCKED_DETAIL };
      for (const o of group.cancel) {
        rows.push(currentRow(occupationOf(o), "b", "alteracao_bloqueada", "alteracao", hold));
      }
      for (const row of inserts) {
        rows.push(
          row.status === "pendente" ? { ...row, status: "alteracao_bloqueada", ...hold } : row,
        );
      }
      continue;
    }
    for (const o of group.cancel) rows.push(cancelRow(o, "alteracao"));
    for (const o of group.insert) affect(o.responsibleUserId);
    rows.push(...inserts);
  }
  for (const pair of diff.responsibleChanged) {
    affect(pair.current.responsibleUserId);
    affect(pair.next.responsibleUserId);
    rows.push(
      currentRow(occupationOf(pair.current), "r", "responsavel", "responsavel", {
        responsibleUserId: pair.next.responsibleUserId,
      }),
    );
  }
  rows.push(...notApplicableRows(plan));

  const count = (kind: ImportChangeKind) => rows.filter((row) => row.changeKind === kind).length;
  return {
    rows,
    version: {
      supersedesBatchId: input.supersedesBatchId,
      inclusoes: count("inclusao"),
      alteracoes: diff.changed.length,
      remocoes: count("remocao"),
      responsaveis: count("responsavel"),
      inalteradas: count("inalterada"),
      mantidasCanceladas: count("mantida_cancelada"),
      affectedUserIds: [...affected].sort(),
    },
  };
}
