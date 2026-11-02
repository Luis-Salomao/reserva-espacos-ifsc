import { expandSlotDates, missingTerms } from "#/domain/expand";
import type { NotApplicableReason } from "#/domain/import-reasons";
import { intervalsOverlap, localDateTime, type Occupation } from "#/domain/occupation";
import type { Semester } from "#/domain/semester";
import type { AscTimetable } from "#/domain/timetable";
import type { WeeklySlot } from "#/import-asc/slots";

/** Destino de uma sala do XML: id do espaço, ou `"ignore"` para não gerar ocupações. */
type RoomTarget = string;
export const IGNORE_ROOM = "ignore";

export type ExistingOccupation = Pick<Occupation, "id" | "spaceId" | "startsAt" | "endsAt">;

type OccupationDraft = {
  /** Chave estável da linha no lote: `o:<aula>:<espaço>:<início>`. */
  rowKey: string;
  lessonId: string;
  spaceId: string;
  startsAt: string;
  endsAt: string;
  title: string;
  responsibleUserId: string | null;
};

type NotApplicable = {
  /** `n:<posição do slot>`. */
  rowKey: string;
  lessonId: string;
  title: string;
  reason: NotApplicableReason;
  detail: string | null;
  weekday: number;
  start: string;
  end: string;
};

export type PlanInput = {
  preview: { slots: readonly WeeklySlot[]; timetable: AscTimetable };
  semester: Semester;
  /** id da sala no XML -> id do espaço ou `"ignore"`; ausente = sem vínculo. */
  roomMap: ReadonlyMap<string, RoomTarget>;
  /** id do docente no XML -> id da conta (ou `null` = sem vínculo). */
  teacherMap: ReadonlyMap<string, string | null>;
  /** Ocupações ativas existentes no período do semestre. */
  existing: readonly ExistingOccupation[];
};

export type ImportPlan = {
  toInsert: OccupationDraft[];
  notApplicable: NotApplicable[];
  /** Colide com ocupação ativa já existente no mesmo espaço (não inserida). */
  conflicts: Array<{ draft: OccupationDraft; existingId: string }>;
  /** Colide com outra linha do mesmo lote (nenhuma das duas é inserida). */
  internalConflicts: Array<{ draft: OccupationDraft; otherRowKey: string }>;
};

const GENERIC_TITLE = "Aula";

function titleOf(timetable: AscTimetable, lessonId: string): string {
  const lesson = timetable.lessons.find((item) => item.id === lessonId);
  if (lesson === undefined) return GENERIC_TITLE;
  const subject = timetable.subjects.find((item) => item.id === lesson.subjectId);
  const subjectLabel = subject === undefined ? "" : subject.short || subject.name;
  const classes = lesson.classIds
    .map((id) => timetable.classes.find((item) => item.id === id)?.short ?? "")
    .filter((short) => short !== "")
    .join(", ");
  if (subjectLabel !== "" && classes !== "") return `${subjectLabel} — ${classes}`;
  return subjectLabel || classes || GENERIC_TITLE;
}

/**
 * Responsável: conta vinculada ao PRIMEIRO docente da aula (na ordem do XML) que tenha vínculo.
 * Sem nenhum vínculo, a ocupação fica sem responsável (só o admin cancela).
 */
function responsibleOf(
  timetable: AscTimetable,
  lessonId: string,
  teacherMap: PlanInput["teacherMap"],
): string | null {
  const lesson = timetable.lessons.find((item) => item.id === lessonId);
  for (const teacherId of lesson?.teacherIds ?? []) {
    const userId = teacherMap.get(teacherId);
    if (userId !== undefined && userId !== null) return userId;
  }
  return null;
}

function hasPartialWeeks(mask: string | null): boolean {
  return mask?.includes("0") === true;
}

type Block = { reason: NotApplicableReason; detail: string | null };

/** Sigla da sala no arquivo (a id do aSc não significa nada para quem lê); cai para a id. */
function roomLabel(timetable: AscTimetable, roomId: string): string {
  const room = timetable.classrooms.find((item) => item.id === roomId);
  return room === undefined ? roomId : room.short || room.name || roomId;
}

/** Motivo que impede o slot de virar ocupações (`null` = pode expandir). */
function blockOf(slot: WeeklySlot, input: PlanInput): Block | null {
  if (slot.status === "no_room") {
    return { reason: "no_room", detail: "A aula não tem sala no arquivo." };
  }
  if (slot.status === "multiple_rooms") {
    return {
      reason: "multiple_rooms",
      detail: "A aula tem mais de uma sala; o significado ainda não foi confirmado.",
    };
  }
  const roomId = slot.classroomIds[0] ?? "";
  const target = input.roomMap.get(roomId);
  if (target === undefined) {
    return {
      reason: "room_unmapped",
      detail: `A sala ${roomLabel(input.preview.timetable, roomId)} não foi vinculada a um espaço.`,
    };
  }
  if (target === IGNORE_ROOM) {
    return {
      reason: "room_ignored",
      detail: `A sala ${roomLabel(input.preview.timetable, roomId)} foi marcada para ignorar.`,
    };
  }
  if (slot.termsMask !== null && !slot.termsMask.includes("1")) {
    return { reason: "never_scheduled", detail: "A aula não está marcada em nenhuma duração." };
  }
  if (hasPartialWeeks(slot.weeksMask)) {
    return {
      reason: "weeks_unsupported",
      detail: "A aula usa semanas alternadas, ainda não suportadas.",
    };
  }
  const missing = missingTerms(slot, input.semester);
  if (missing.length > 0) {
    return {
      reason: "term_without_dates",
      detail: `Sem datas configuradas para a duração ${missing.join(", ")}.`,
    };
  }
  return null;
}

function sortByStart(drafts: OccupationDraft[]): OccupationDraft[] {
  return [...drafts].sort((a, b) =>
    a.startsAt < b.startsAt ? -1 : a.startsAt > b.startsAt ? 1 : 0,
  );
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

/** Primeira ocupação existente que se sobrepõe ao rascunho, por espaço (`existing` ordenado por início). */
function findExisting(
  draft: OccupationDraft,
  sameSpace: readonly ExistingOccupation[] | undefined,
): string | null {
  for (const other of sameSpace ?? []) {
    if (other.startsAt >= draft.endsAt) break;
    if (intervalsOverlap(draft, other)) return other.id;
  }
  return null;
}

function splitInternalConflicts(candidates: OccupationDraft[]): {
  ok: OccupationDraft[];
  internal: ImportPlan["internalConflicts"];
} {
  const other = new Map<string, string>();
  for (const drafts of groupBySpace(candidates).values()) {
    const sorted = sortByStart(drafts);
    for (let i = 0; i < sorted.length; i++) {
      const a = sorted[i] as OccupationDraft;
      for (let j = i + 1; j < sorted.length; j++) {
        const b = sorted[j] as OccupationDraft;
        if (b.startsAt >= a.endsAt) break;
        if (!other.has(a.rowKey)) other.set(a.rowKey, b.rowKey);
        if (!other.has(b.rowKey)) other.set(b.rowKey, a.rowKey);
      }
    }
  }
  const ok: OccupationDraft[] = [];
  const internal: ImportPlan["internalConflicts"] = [];
  for (const draft of candidates) {
    const otherRowKey = other.get(draft.rowKey);
    if (otherRowKey === undefined) ok.push(draft);
    else internal.push({ draft, otherRowKey });
  }
  return { ok, internal };
}

/**
 * Plano da importação (puro): quais ocorrências viram ocupações, quais slots não se aplicam (com
 * motivo) e quais colidem com ocupações existentes ou entre si. Nada é inventado: sala sem vínculo,
 * sala ignorada, várias salas, semanas alternadas e duração sem datas ficam não aplicáveis.
 */
export function planImport(input: PlanInput): ImportPlan {
  const { preview, semester } = input;
  const notApplicable: NotApplicable[] = [];
  const drafts = new Map<string, OccupationDraft>();
  const seenDuplicates = new Set<string>();

  preview.slots.forEach((slot, index) => {
    const base = {
      rowKey: `n:${index}`,
      lessonId: slot.lessonId,
      title: titleOf(preview.timetable, slot.lessonId),
      weekday: slot.weekday,
      start: slot.start,
      end: slot.end,
    };
    const block = blockOf(slot, input);
    if (block !== null) {
      notApplicable.push({ ...base, ...block });
      return;
    }
    const spaceId = input.roomMap.get(slot.classroomIds[0] ?? "") as string;
    const occurrences = expandSlotDates(slot, semester);
    if (occurrences.length === 0) {
      notApplicable.push({
        ...base,
        reason: "no_dates",
        detail: "Nenhuma data do semestre cai neste dia da semana.",
      });
      return;
    }
    const title = base.title;
    const responsibleUserId = responsibleOf(preview.timetable, slot.lessonId, input.teacherMap);
    for (const occurrence of occurrences) {
      // Se o semestre tem bloco com o mesmo número do período, o horário do bloco vence o do XML.
      const block = semester.blocks.find((item) => item.number === occurrence.period);
      const startsAt = localDateTime(occurrence.date, block?.start ?? occurrence.start);
      const endsAt = localDateTime(occurrence.date, block?.end ?? occurrence.end);
      const rowKey = `o:${slot.lessonId}:${spaceId}:${startsAt}`;
      const kept = drafts.get(rowKey);
      if (kept !== undefined) {
        const duplicateKey = `d:${rowKey}:${endsAt}`;
        if (kept.endsAt !== endsAt && !seenDuplicates.has(duplicateKey)) {
          seenDuplicates.add(duplicateKey);
          notApplicable.push({
            ...base,
            rowKey: duplicateKey,
            start: startsAt.slice(11),
            end: endsAt.slice(11),
            reason: "duplicate_occurrence",
            detail: `Outro card da mesma aula na mesma sala começa às ${startsAt.slice(11)} e termina às ${endsAt.slice(11)} em ${startsAt.slice(0, 10)}.`,
          });
        }
        continue;
      }
      drafts.set(rowKey, {
        rowKey,
        lessonId: slot.lessonId,
        spaceId,
        startsAt,
        endsAt,
        title,
        responsibleUserId,
      });
    }
  });

  const existingBySpace = groupBySpace(
    [...input.existing].sort((a, b) =>
      a.startsAt < b.startsAt ? -1 : a.startsAt > b.startsAt ? 1 : 0,
    ),
  );
  const conflicts: ImportPlan["conflicts"] = [];
  const candidates: OccupationDraft[] = [];
  for (const draft of drafts.values()) {
    const existingId = findExisting(draft, existingBySpace.get(draft.spaceId));
    if (existingId === null) candidates.push(draft);
    else conflicts.push({ draft, existingId });
  }
  const { ok, internal } = splitInternalConflicts(candidates);
  return { toInsert: ok, notApplicable, conflicts, internalConflicts: internal };
}
