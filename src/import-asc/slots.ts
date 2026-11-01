import type { AscTimetable, Card, Lesson, Period } from "#/domain/timetable.ts";

export type WeeklySlot = {
  lessonId: string;
  /** 0 = segunda-feira. */
  weekday: number;
  start: string;
  end: string;
  periodFrom: number;
  periodTo: number;
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
    | "invalid_period";
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

export type WeeklyGrid = {
  slots: WeeklySlot[];
  issues: SlotIssue[];
  overlaps: InternalOverlap[];
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

/** Cada card cobre apenas o próprio período; um card gera um slot por dia marcado. */
function cardSlots(
  card: Card,
  lesson: Lesson,
  usable: Period[],
  issues: SlotIssue[],
): WeeklySlot[] {
  const period = usable.find((candidate) => candidate.number === card.period);
  if (period === undefined) {
    issues.push({ code: "missing_period", ref: card.lessonId });
    return [];
  }
  if (card.days === null || !DAYS_MASK.test(card.days)) {
    issues.push({ code: "invalid_days", ref: card.lessonId });
    return [];
  }
  const classroomIds = card.classroomIds.length > 0 ? card.classroomIds : lesson.classroomIds;
  const slots: WeeklySlot[] = [];
  for (let weekday = 0; weekday < card.days.length; weekday++) {
    if (card.days[weekday] !== "1") continue;
    slots.push({
      lessonId: card.lessonId,
      weekday,
      start: period.start,
      end: period.end,
      periodFrom: period.number,
      periodTo: period.number,
      classroomIds: [...classroomIds].sort(),
      termsMask: card.terms || null,
      weeksMask: card.weeks || null,
      status: roomStatus(classroomIds.length),
    });
  }
  return slots;
}

/** Junta slots da mesma lesson/dia/sala/terms/weeks cujos períodos são consecutivos entre os utilizáveis. */
function mergeConsecutive(slots: WeeklySlot[], usable: Period[]): WeeklySlot[] {
  const position = new Map(usable.map((period, index) => [period.number, index]));
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
  const at = (number: number) => position.get(number) ?? -1;
  const merged: WeeklySlot[] = [];
  for (const group of groups.values()) {
    group.sort((a, b) => at(a.periodFrom) - at(b.periodFrom));
    let current: WeeklySlot | undefined;
    for (const slot of group) {
      if (current !== undefined && at(slot.periodFrom) === at(current.periodTo) + 1) {
        current.end = slot.end;
        current.periodTo = slot.periodTo;
      } else {
        current = { ...slot };
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
  if (a === null && b === null) return true;
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

/** Indexa cada slot sob cada uma de suas salas; `no_room` fica de fora. */
function groupByRoomAndDay(slots: WeeklySlot[]): Map<string, WeeklySlot[]> {
  const groups = new Map<string, WeeklySlot[]>();
  for (const slot of slots) {
    if (slot.status === "no_room") continue;
    for (const room of slot.classroomIds) {
      const key = JSON.stringify([room, slot.weekday]);
      const group = groups.get(key);
      if (group === undefined) groups.set(key, [slot]);
      else group.push(slot);
    }
  }
  return groups;
}

function conflicts(a: WeeklySlot, b: WeeklySlot): boolean {
  return (
    a.lessonId !== b.lessonId &&
    a.start < b.end &&
    b.start < a.end &&
    masksOverlap(a.termsMask, b.termsMask) &&
    masksOverlap(a.weeksMask, b.weeksMask)
  );
}

/** Um par de slots que compartilha N salas gera N overlaps (um por sala). */
function findOverlaps(slots: WeeklySlot[]): InternalOverlap[] {
  const overlaps: InternalOverlap[] = [];
  for (const [key, group] of groupByRoomAndDay(slots)) {
    group.sort(compareSlots);
    const [classroomId = ""] = JSON.parse(key) as [string, number];
    group.forEach((a, i) => {
      for (const b of group.slice(i + 1)) {
        if (b.start >= a.end) break;
        if (conflicts(a, b)) {
          const kind =
            a.status === "applicable" && b.status === "applicable" ? "certain" : "possible";
          overlaps.push({ classroomId, weekday: a.weekday, kind, a, b });
        }
      }
    });
  }
  return overlaps.sort(
    (x, y) =>
      compareText(x.classroomId, y.classroomId) ||
      x.weekday - y.weekday ||
      compareText(x.a.start, y.a.start) ||
      compareText(x.a.lessonId, y.a.lessonId) ||
      compareText(x.b.start, y.b.start) ||
      compareText(x.b.lessonId, y.b.lessonId),
  );
}

/** Expande os cards em ocorrências semanais e detecta conflitos internos de sala. */
export function buildWeeklySlots(timetable: AscTimetable): WeeklyGrid {
  const issues: SlotIssue[] = [];
  const usable = usablePeriods(timetable.periods, issues);
  const lessons = new Map(timetable.lessons.map((lesson) => [lesson.id, lesson]));
  const withCards = new Set<string>();
  const raw: WeeklySlot[] = [];
  for (const card of timetable.cards) {
    const lesson = lessons.get(card.lessonId);
    if (lesson === undefined) continue;
    withCards.add(lesson.id);
    raw.push(...cardSlots(card, lesson, usable, issues));
  }
  const slots = mergeConsecutive(raw, usable);
  const incomplete = new Set<string>();
  const position = new Map(usable.map((period, index) => [period.number, index]));
  for (const slot of slots) {
    const needed = lessons.get(slot.lessonId)?.periodsPerCard ?? 1;
    const span = (position.get(slot.periodTo) ?? 0) - (position.get(slot.periodFrom) ?? 0) + 1;
    if (span < needed && !incomplete.has(slot.lessonId)) {
      incomplete.add(slot.lessonId);
      issues.push({ code: "incomplete_block", ref: slot.lessonId });
    }
  }
  for (const lesson of timetable.lessons) {
    if (!withCards.has(lesson.id)) issues.push({ code: "lesson_without_cards", ref: lesson.id });
  }
  slots.sort(compareSlots);
  return { slots, issues, overlaps: findOverlaps(slots) };
}
