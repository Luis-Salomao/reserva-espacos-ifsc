import { weekdayOf } from "#/domain/calendar";
import type { ImportRow } from "#/domain/import-batch";
import type { ImportPlan } from "./import-plan";

export type OccurrenceDraft = ImportPlan["toInsert"][number];

type OccurrenceOutcome = Pick<
  ImportRow,
  "status" | "reasonCode" | "reasonDetail" | "conflictOccupationId"
>;

export const PENDING_INSERT: OccurrenceOutcome = {
  status: "pendente",
  reasonCode: null,
  reasonDetail: null,
  conflictOccupationId: null,
};

export const existingConflict = (existingId: string): OccurrenceOutcome => ({
  status: "conflito",
  reasonCode: "conflito_existente",
  reasonDetail: "Já existe uma ocupação ativa neste espaço e horário.",
  conflictOccupationId: existingId,
});

export const internalConflict: OccurrenceOutcome = {
  status: "conflito_interno",
  reasonCode: "conflito_interno",
  reasonDetail: "Outra aula do mesmo arquivo ocupa o mesmo espaço e horário.",
  conflictOccupationId: null,
};

function timePart(startsAt: string): string {
  return startsAt.slice(11);
}

/** Linha de inserção (ou conflito) de uma ocorrência do plano; `batchId` vazio até o lote existir. */
export function occurrenceRow(
  draft: OccurrenceDraft,
  outcome: OccurrenceOutcome,
  changeKind: ImportRow["changeKind"] = null,
): ImportRow {
  return {
    batchId: "",
    rowKey: draft.rowKey,
    lessonId: draft.lessonId,
    weekday: weekdayOf(draft.startsAt.slice(0, 10)),
    spaceId: draft.spaceId,
    date: draft.startsAt.slice(0, 10),
    startTime: timePart(draft.startsAt),
    endTime: timePart(draft.endsAt),
    title: draft.title,
    responsibleUserId: draft.responsibleUserId,
    occupationId: null,
    changeKind,
    ...outcome,
  };
}

/** Linhas dos slots que não viram ocupação (com o motivo). */
export function notApplicableRows(plan: ImportPlan): ImportRow[] {
  return plan.notApplicable.map((item) => ({
    batchId: "",
    rowKey: item.rowKey,
    lessonId: item.lessonId,
    weekday: item.weekday,
    spaceId: null,
    date: null,
    startTime: item.start,
    endTime: item.end,
    title: item.title,
    responsibleUserId: null,
    status: "nao_aplicavel",
    reasonCode: item.reason,
    reasonDetail: item.detail,
    occupationId: null,
    conflictOccupationId: null,
    changeKind: null,
  }));
}

/** Linhas do plano da primeira versão do semestre (sem lote: o chamador carimba o id). */
export function plannedRows(plan: ImportPlan): ImportRow[] {
  return [
    ...plan.toInsert.map((draft) => occurrenceRow(draft, PENDING_INSERT)),
    ...plan.conflicts.map(({ draft, existingId }) =>
      occurrenceRow(draft, existingConflict(existingId)),
    ),
    ...plan.internalConflicts.map(({ draft }) => occurrenceRow(draft, internalConflict)),
    ...notApplicableRows(plan),
  ];
}
