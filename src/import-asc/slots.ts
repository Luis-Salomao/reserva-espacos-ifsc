import type { AscTimetable, Card, Lesson, Period } from "#/domain/timetable.ts";

type WeeklySlot = {
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

type SlotIssue = {
  code:
    | "missing_period"
    | "period_overflow"
    | "invalid_days"
    | "lesson_without_cards"
    | "invalid_period";
  ref: string;
};

type InternalOverlap = {
  classroomId: string;
  weekday: number;
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

function cardSlots(
  card: Card,
  lesson: Lesson,
  usable: Period[],
  issues: SlotIssue[],
): WeeklySlot[] {
  const first = usable.findIndex((period) => period.number === card.period);
  const start = usable[first];
  if (start === undefined) {
    issues.push({ code: "missing_period", ref: card.lessonId });
    return [];
  }
  const last = usable[first + Math.max(1, lesson.periodsPerCard) - 1];
  if (last === undefined) {
    issues.push({ code: "period_overflow", ref: card.lessonId });
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
      start: start.start,
      end: last.end,
      periodFrom: start.number,
      periodTo: last.number,
      classroomIds: [...classroomIds],
      termsMask: card.terms,
      weeksMask: card.weeks,
      status: roomStatus(classroomIds.length),
    });
  }
  return slots;
}

function singleOverlap(a: string, b: string): boolean {
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i++) {
    if (a[i] === "1" && b[i] === "1") return true;
  }
  return false;
}

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

function groupByRoomAndDay(slots: WeeklySlot[]): Map<string, WeeklySlot[]> {
  const groups = new Map<string, WeeklySlot[]>();
  for (const slot of slots) {
    const room = slot.classroomIds[0];
    if (slot.status !== "applicable" || room === undefined) continue;
    const key = `${room}\u0000${slot.weekday}`;
    const group = groups.get(key);
    if (group === undefined) groups.set(key, [slot]);
    else group.push(slot);
  }
  return groups;
}

function conflicts(a: WeeklySlot, b: WeeklySlot): boolean {
  return (
    a.start < b.end &&
    b.start < a.end &&
    masksOverlap(a.termsMask, b.termsMask) &&
    masksOverlap(a.weeksMask, b.weeksMask)
  );
}

function findOverlaps(slots: WeeklySlot[]): InternalOverlap[] {
  const overlaps: InternalOverlap[] = [];
  for (const group of groupByRoomAndDay(slots).values()) {
    group.sort(compareSlots);
    group.forEach((a, i) => {
      for (const b of group.slice(i + 1)) {
        if (b.start >= a.end) break;
        if (conflicts(a, b)) {
          overlaps.push({ classroomId: a.classroomIds[0] ?? "", weekday: a.weekday, a, b });
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
  const slots: WeeklySlot[] = [];
  for (const card of timetable.cards) {
    const lesson = lessons.get(card.lessonId);
    if (lesson === undefined) continue;
    withCards.add(lesson.id);
    slots.push(...cardSlots(card, lesson, usable, issues));
  }
  for (const lesson of timetable.lessons) {
    if (!withCards.has(lesson.id)) issues.push({ code: "lesson_without_cards", ref: lesson.id });
  }
  slots.sort(compareSlots);
  return { slots, issues, overlaps: findOverlaps(slots) };
}
