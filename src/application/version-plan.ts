import type { ExistingOccupation, PlanInput } from "#/application/import-plan";
import { planImport } from "#/application/import-plan";
import type { VersionOccupation } from "#/application/ports";
import { weekdayOf } from "#/domain/calendar";
import type { ImportChangeKind, ImportRow, VersionSummary } from "#/domain/import-batch";
import { describeReason } from "#/domain/import-reasons";
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

const HELD_PREFIX = "Nova versão não aplicável: ";

const dateOf = (startsAt: string) => startsAt.slice(0, 10);
const lessonDay = (title: string, date: string) => `${title}\u0000${date}`;

type NotApplicableItem = ReturnType<typeof planImport>["notApplicable"][number];

/**
 * Alcance de um card não aplicável: mesmo título e dia da semana, horário de algum período do card
 * (o bloco do semestre sobrepõe o XML, como na expansão) e data nas durações que o card cobre
 * (máscara nula ou sem datas utilizáveis = o semestre inteiro).
 */
function itemScope(item: NotApplicableItem, semester: VersionPlanInput["semester"]) {
  const slots = item.segments.map((segment) => {
    const block = semester.blocks.find((candidate) => candidate.number === segment.period);
    return { start: block?.start ?? segment.start, end: block?.end ?? segment.end };
  });
  if (slots.length === 0) slots.push({ start: item.start, end: item.end });
  const ranges = dateRanges(item.termsMask, semester);
  return {
    item,
    matches(o: VersionOccurrence): boolean {
      return (
        o.lessonKey === item.title &&
        weekdayOf(o.date) === item.weekday &&
        slots.some((slot) => o.startsAt.slice(11) < slot.end && slot.start < o.endsAt.slice(11)) &&
        (ranges === null || ranges.some(([from, to]) => o.date >= from && o.date <= to))
      );
    },
  };
}

/** Intervalos de datas das durações marcadas; `null` = sem recorte (todo o semestre). */
function dateRanges(
  mask: string | null,
  semester: VersionPlanInput["semester"],
): Array<[string, string]> | null {
  if (mask === null) return null;
  const wanted = [...mask].flatMap((bit, index) => (bit === "1" ? [index + 1] : []));
  const ranges: Array<[string, string]> = [];
  for (const position of wanted) {
    const term = semester.terms.find((candidate) => candidate.position === position);
    // Duração marcada sem datas configuradas: não há como recortar, vale o semestre inteiro.
    if (term === undefined) return null;
    ranges.push([term.start, term.end]);
  }
  return ranges.length === 0 ? null : ranges;
}

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
 *
 * Aula vigente cujas ocorrências no arquivo novo NÃO SÃO APLICÁVEIS (várias salas, sala sem vínculo,
 * duração sem datas...) não some: as ocupações dela (mesmo título, dia da semana e horário do período
 * do card, nas durações que o card cobre, sem ocorrência aplicável no mesmo horário e data) ficam SEGURADAS (`alteracao_bloqueada`, `versao_nao_aplicavel`) e contam
 * como permanecendo; `bloqueadas` conta cada ocupação segurada (uma por linha) mais os grupos bloqueados
 * por conflito. A exceção é `room_ignored`: a pessoa mandou ignorar a sala, então cancela, com
 * esse motivo na linha.
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

  // Aulas vigentes cujo horário novo não é aplicável: seguradas (nada é cancelado nem inserido).
  // O card não aplicável e a cobertura são casados por (título, dia da semana, horário do período):
  // o horário vem do período do card com o bloco do semestre por cima, como na expansão.
  const nextSlots = new Map<string, Array<{ startsAt: string; endsAt: string }>>();
  for (const o of next) {
    const key = lessonDay(o.lessonKey, o.date);
    const list = nextSlots.get(key);
    if (list === undefined) nextSlots.set(key, [o]);
    else list.push(o);
  }
  const covered = (o: VersionOccurrence) =>
    (nextSlots.get(lessonDay(o.lessonKey, o.date)) ?? []).some((n) => intervalsOverlap(n, o));
  const scopes = (kind: "unusable" | "ignored") =>
    plan.notApplicable
      .filter((item) => item.reason !== "duplicate_occurrence") // a outra via do mesmo card vale
      .filter((item) => (item.reason === "room_ignored") === (kind === "ignored"))
      .map((item) => itemScope(item, input.semester));
  const unusable = scopes("unusable");
  const ignored = scopes("ignored");
  const heldFor = (o: VersionOccurrence) => unusable.find((scope) => scope.matches(o));
  const heldOccurrences = current.filter(
    (o) => o.status !== "cancelada" && !covered(o) && heldFor(o) !== undefined,
  );
  const heldSet = new Set(heldOccurrences);

  const diff = diffVersions(
    current.filter((o) => !heldSet.has(o)),
    next,
  );
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

  // Ocupações vigentes que continuam ativas depois deste lote (inalteradas, troca de responsável e,
  // abaixo, as seguradas por grupos bloqueados): uma inserção sobre elas é conflito.
  const staying = groupBySpace([
    ...[...diff.unchanged, ...diff.responsibleChanged].map((pair) => occupationOf(pair.current)),
    ...heldOccurrences.map(occupationOf),
  ]);
  const insertRow = (
    o: VersionOccurrence,
    changeKind: ImportChangeKind,
    own: ReadonlySet<string> = new Set(),
  ): ImportRow => {
    const draft = draftOf.get(o) as OccurrenceDraft;
    let outcome = outcomeOf.get(draft) as Parameters<typeof occurrenceRow>[1];
    if (outcome === PENDING_INSERT) {
      const blocker = (staying.get(draft.spaceId) ?? []).find(
        (other) => !own.has(other.id) && intervalsOverlap(draft, other),
      );
      if (blocker !== undefined) outcome = existingConflict(blocker.id);
    }
    return occurrenceRow(draft, outcome, changeKind);
  };
  const isConflict = (row: ImportRow) =>
    row.status === "conflito" || row.status === "conflito_interno";

  // Ponto fixo: um grupo com nova ocorrência já em conflito (com algo que este lote não cancela) fica
  // bloqueado e SEGURA suas ocupações antigas; isso pode fazer outro grupo, que iria para o lugar delas,
  // conflitar também. Repete até nenhum grupo mudar de estado.
  const blockedGroups = new Set<(typeof diff.changed)[number]>();
  for (let flipped = true; flipped; ) {
    flipped = false;
    for (const group of diff.changed) {
      if (blockedGroups.has(group)) continue;
      if (!group.insert.some((o) => isConflict(insertRow(o, "alteracao")))) continue;
      blockedGroups.add(group);
      for (const o of group.cancel) {
        const held = occupationOf(o);
        const list = staying.get(held.spaceId);
        if (list === undefined) staying.set(held.spaceId, [held]);
        else list.push(held);
      }
      flipped = true;
    }
  }
  const cancelRow = (
    o: VersionOccurrence,
    changeKind: ImportChangeKind,
    extra: Partial<ImportRow> = {},
  ): ImportRow => {
    const occupation = occupationOf(o);
    affect(occupation.responsibleUserId);
    return currentRow(occupation, "c", "cancelar", changeKind, extra);
  };

  // Regra 4: quem ganha uma ocorrência (inclusão pura, ou alteração, mesmo bloqueada ou em conflito)
  // é avisado; assim como quem perde uma por cancelamento e quem é trocado como responsável.
  for (const o of diff.added) {
    affect(o.responsibleUserId);
    rows.push(insertRow(o, "inclusao"));
  }
  for (const o of diff.removed) {
    const why = ignored.find((scope) => scope.matches(o))?.item;
    rows.push(
      cancelRow(
        o,
        "remocao",
        why === undefined ? {} : { reasonCode: why.reason, reasonDetail: why.detail },
      ),
    );
  }
  for (const o of heldOccurrences) {
    const why = (heldFor(o) as NonNullable<ReturnType<typeof heldFor>>).item;
    rows.push(
      currentRow(occupationOf(o), "h", "alteracao_bloqueada", "alteracao", {
        reasonCode: "versao_nao_aplicavel",
        reasonDetail: `${HELD_PREFIX}${describeReason(why.reason, null).label}`,
      }),
    );
  }
  for (const group of diff.changed) {
    // Grupo bloqueado: nada é cancelado nem inserido e a versão anterior continua.
    // Conflito que só aparece na aplicação (fase de inserções, depois dos cancelamentos) é um
    // resíduo aceito: a linha vira conflito concorrente e a aula pode ficar sem sala até resolver.
    const own = new Set(group.cancel.map((o) => o.occupationId as string));
    const inserts = group.insert.map((o) => insertRow(o, "alteracao", own));
    for (const o of group.insert) affect(o.responsibleUserId);
    if (blockedGroups.has(group)) {
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
      inclusoesEmConflito: rows.filter((row) => row.changeKind === "inclusao" && isConflict(row))
        .length,
      alteracoes: diff.changed.length - blockedGroups.size,
      bloqueadas: blockedGroups.size + heldOccurrences.length,
      remocoes: count("remocao"),
      responsaveis: count("responsavel"),
      inalteradas: count("inalterada"),
      mantidasCanceladas: count("mantida_cancelada"),
      affectedUserIds: [...affected].sort(),
    },
  };
}
