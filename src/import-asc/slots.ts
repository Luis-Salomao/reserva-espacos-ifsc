import type { AscTimetable, Card, Lesson, Period } from "#/domain/timetable.ts";

/** Um card de um período: o horário real, usado para não ocupar intervalos entre blocos. */
type SlotSegment = { period: number; start: string; end: string };

export type WeeklySlot = {
  lessonId: string;
  /**
   * 0 = segunda-feira. Premissa do aSc (não verificada em outras versões): a posição 0 das
   * máscaras de dias é a segunda-feira.
   */
  weekday: number;
  /** Menor início entre os segmentos (só para exibição). */
  start: string;
  /** Maior fim entre os segmentos (só para exibição). */
  end: string;
  /** Período do primeiro segmento no relógio. */
  periodFrom: number;
  /** Período do último segmento no relógio. */
  periodTo: number;
  /** Um por card, em ordem de relógio. Conflitos e ocupação usam os segmentos, não `start`/`end`. */
  segments: SlotSegment[];
  classroomIds: string[];
  termsMask: string | null;
  weeksMask: string | null;
  status: "applicable" | "no_room" | "multiple_rooms";
};

export type SlotIssue = {
  code:
    | "missing_period"
    | "incomplete_block"
    | "invalid_days"
    | "lesson_without_cards"
    | "invalid_period"
    | "never_scheduled";
  ref: string;
};

export type InternalOverlap = {
  classroomId: string;
  weekday: number;
  /** `certain`: ambos `applicable`; `possible`: algum slot tem várias salas (semântica desconhecida). */
  kind: "certain" | "possible";
  a: WeeklySlot;
  b: WeeklySlot;
};

/** Máximo de pares guardados em `overlaps`; as contagens em `overlapCounts` continuam exatas. */
export const MAX_OVERLAP_DETAIL = 200;

export type WeeklyGrid = {
  slots: WeeklySlot[];
  issues: SlotIssue[];
  /** Os primeiros `MAX_OVERLAP_DETAIL` pares, em ordem determinística. */
  overlaps: InternalOverlap[];
  overlapCounts: { certain: number; possible: number };
  overlapsTruncated: boolean;
  /** Períodos utilizáveis em ordem de relógio. */
  periods: Period[];
};

const DAYS_MASK = /^[01]*1[01]*$/;

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Períodos utilizáveis: número único (o primeiro vence) e fim depois do início, em ordem numérica. */
function usablePeriods(periods: Period[], issues: SlotIssue[]): Period[] {
  const seen = new Set<number>();
  const usable: Period[] = [];
  for (const period of periods) {
    if (seen.has(period.number) || period.end <= period.start) {
      issues.push({ code: "invalid_period", ref: String(period.number) });
      continue;
    }
    seen.add(period.number);
    usable.push(period);
  }
  return usable.sort((a, b) => a.number - b.number);
}

function roomStatus(count: number): WeeklySlot["status"] {
  if (count === 0) return "no_room";
  return count > 1 ? "multiple_rooms" : "applicable";
}

/** Dias marcados em qualquer das máscaras (lista separada por vírgula); `null` se nenhuma é válida. */
function weekdaysOf(days: string | null): number[] | null {
  if (days === null) return null;
  const marked = new Set<number>();
  for (const part of days.split(",")) {
    if (!DAYS_MASK.test(part)) continue;
    for (let weekday = 0; weekday < part.length; weekday++) {
      if (part[weekday] === "1") marked.add(weekday);
    }
  }
  return marked.size === 0 ? null : [...marked].sort((a, b) => a - b);
}

/** Máscara que não marca nenhuma posição: o card nunca é agendado. */
function neverMarked(mask: string | null): boolean {
  return mask !== null && mask !== "" && !mask.includes("1");
}

/** Cada card cobre apenas o próprio período; um card gera um slot por dia marcado. */
function cardSlots(
  card: Card,
  lesson: Lesson,
  periodByNumber: Map<number, Period>,
  issues: SlotIssue[],
): WeeklySlot[] {
  const period = periodByNumber.get(card.period ?? -1);
  if (period === undefined) {
    issues.push({ code: "missing_period", ref: card.lessonId });
    return [];
  }
  const weekdays = weekdaysOf(card.days);
  if (weekdays === null) {
    issues.push({ code: "invalid_days", ref: card.lessonId });
    return [];
  }
  if (neverMarked(card.terms) || neverMarked(card.weeks)) {
    issues.push({ code: "never_scheduled", ref: card.lessonId });
    return [];
  }
  // Salas do card que não existem foram descartadas na normalização: nunca herdam da aula.
  const own = card.roomsUnknown === true || card.classroomIds.length > 0;
  const classroomIds = own ? card.classroomIds : lesson.classroomIds;
  return weekdays.map((weekday) => ({
    lessonId: card.lessonId,
    weekday,
    start: period.start,
    end: period.end,
    periodFrom: period.number,
    periodTo: period.number,
    segments: [{ period: period.number, start: period.start, end: period.end }],
    classroomIds: [...classroomIds].sort(),
    termsMask: card.terms || null,
    weeksMask: card.weeks || null,
    status: roomStatus(classroomIds.length),
  }));
}

/**
 * Junta slots da mesma lesson/dia/sala/terms/weeks que são vizinhos no RELÓGIO: o próximo começa
 * quando (ou depois que) o atual termina e nenhum outro período utilizável começa estritamente
 * entre os dois. A numeração dos períodos pode não seguir o relógio (ex.: 6 = 20:10, 7 = 19:00).
 * A mescla serve à exibição; os segmentos preservam os horários reais.
 */
function mergeConsecutive(slots: WeeklySlot[], usable: Period[]): WeeklySlot[] {
  const starts = usable.map((period) => period.start);
  const groups = new Map<string, WeeklySlot[]>();
  for (const slot of slots) {
    const key = JSON.stringify([
      slot.lessonId,
      slot.weekday,
      slot.classroomIds,
      slot.termsMask,
      slot.weeksMask,
    ]);
    const group = groups.get(key);
    if (group === undefined) groups.set(key, [slot]);
    else group.push(slot);
  }
  const merged: WeeklySlot[] = [];
  for (const group of groups.values()) {
    group.sort(
      (a, b) =>
        compareText(a.start, b.start) || compareText(a.end, b.end) || a.periodFrom - b.periodFrom,
    );
    let current: WeeklySlot | undefined;
    for (const slot of group) {
      const bound = current;
      if (
        bound !== undefined &&
        slot.start >= bound.end &&
        !starts.some((start) => start > bound.end && start < slot.start)
      ) {
        bound.end = slot.end;
        bound.periodTo = slot.periodFrom;
        bound.segments.push(...slot.segments);
      } else {
        current = { ...slot, segments: [...slot.segments] };
        merged.push(current);
      }
    }
  }
  return merged;
}

function singleOverlap(a: string, b: string): boolean {
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i++) {
    if (a[i] === "1" && b[i] === "1") return true;
  }
  return false;
}

// exported for tests
/** `null` significa "todos"; máscaras de tamanhos diferentes comparam o prefixo comum. */
export function masksOverlap(a: string | null, b: string | null): boolean {
  if (a === b) return a === null || a.includes("1");
  if (a === null) return b?.includes("1") ?? true;
  if (b === null) return a.includes("1");
  for (const left of a.split(",")) {
    for (const right of b.split(",")) {
      if (singleOverlap(left, right)) return true;
    }
  }
  return false;
}

function compareSlots(a: WeeklySlot, b: WeeklySlot): number {
  return (
    a.weekday - b.weekday || compareText(a.start, b.start) || compareText(a.lessonId, b.lessonId)
  );
}

function segmentsOverlap(a: WeeklySlot, b: WeeklySlot): boolean {
  for (const left of a.segments) {
    for (const right of b.segments) {
      if (left.start < right.end && right.start < left.end) return true;
    }
  }
  return false;
}

function conflicts(a: WeeklySlot, b: WeeklySlot): boolean {
  return (
    a.lessonId !== b.lessonId &&
    segmentsOverlap(a, b) &&
    masksOverlap(a.termsMask, b.termsMask) &&
    masksOverlap(a.weeksMask, b.weeksMask)
  );
}

type RoomDay = { classroomId: string; weekday: number; slots: WeeklySlot[] };

/** Indexa cada slot sob cada uma de suas salas; `no_room` fica de fora. Ordem: sala, dia. */
function groupByRoomAndDay(slots: WeeklySlot[]): RoomDay[] {
  const groups = new Map<string, RoomDay>();
  for (const slot of slots) {
    if (slot.status === "no_room") continue;
    for (const classroomId of slot.classroomIds) {
      const key = JSON.stringify([classroomId, slot.weekday]);
      const group = groups.get(key);
      if (group === undefined) {
        groups.set(key, { classroomId, weekday: slot.weekday, slots: [slot] });
      } else group.slots.push(slot);
    }
  }
  return [...groups.values()].sort(
    (a, b) => compareText(a.classroomId, b.classroomId) || a.weekday - b.weekday,
  );
}

/**
 * Conta todos os pares conflitantes sem materializá-los e guarda só os primeiros
 * `MAX_OVERLAP_DETAIL`. Um par que compartilha N salas conta N vezes (um por sala).
 * A ordem (sala, dia, início/aula de `a`, início/aula de `b`) é a própria ordem de iteração.
 */
function scanOverlaps(
  slots: WeeklySlot[],
): Pick<WeeklyGrid, "overlaps" | "overlapCounts" | "overlapsTruncated"> {
  const overlaps: InternalOverlap[] = [];
  const overlapCounts = { certain: 0, possible: 0 };
  for (const { classroomId, weekday, slots: group } of groupByRoomAndDay(slots)) {
    group.sort(compareSlots);
    for (let i = 0; i < group.length; i++) {
      const a = group[i];
      if (a === undefined) continue;
      for (let j = i + 1; j < group.length; j++) {
        const b = group[j];
        // Ordenado por início: se `b` começa depois do fim de `a`, os próximos também.
        if (b === undefined || b.start >= a.end) break;
        if (!conflicts(a, b)) continue;
        const kind =
          a.status === "applicable" && b.status === "applicable" ? "certain" : "possible";
        overlapCounts[kind] += 1;
        if (overlaps.length < MAX_OVERLAP_DETAIL) {
          overlaps.push({ classroomId, weekday, kind, a, b });
        }
      }
    }
  }
  return {
    overlaps,
    overlapCounts,
    overlapsTruncated: overlapCounts.certain + overlapCounts.possible > overlaps.length,
  };
}

/** Expande os cards em ocorrências semanais e detecta conflitos internos de sala. */
export function buildWeeklySlots(timetable: AscTimetable): WeeklyGrid {
  const issues: SlotIssue[] = [];
  const usable = usablePeriods(timetable.periods, issues);
  const periodByNumber = new Map(usable.map((period) => [period.number, period]));
  const lessons = new Map(timetable.lessons.map((lesson) => [lesson.id, lesson]));
  const withCards = new Set<string>();
  const raw: WeeklySlot[] = [];
  for (const card of timetable.cards) {
    const lesson = lessons.get(card.lessonId);
    if (lesson === undefined) continue;
    withCards.add(lesson.id);
    raw.push(...cardSlots(card, lesson, periodByNumber, issues));
  }
  const slots = mergeConsecutive(raw, usable);
  const incomplete = new Set<string>();
  for (const slot of slots) {
    const needed = lessons.get(slot.lessonId)?.periodsPerCard ?? 1;
    if (slot.segments.length < needed && !incomplete.has(slot.lessonId)) {
      incomplete.add(slot.lessonId);
      issues.push({ code: "incomplete_block", ref: slot.lessonId });
    }
  }
  for (const lesson of timetable.lessons) {
    if (!withCards.has(lesson.id)) issues.push({ code: "lesson_without_cards", ref: lesson.id });
  }
  slots.sort(compareSlots);
  const periods = [...usable].sort(
    (a, b) => compareText(a.start, b.start) || compareText(a.end, b.end) || a.number - b.number,
  );
  return { slots, issues, ...scanOverlaps(slots), periods };
}
