import type { AscTimetable, Period } from "#/domain/timetable.ts";
import { rejection } from "./errors.ts";
import { normalizeAsc } from "./normalize.ts";
import { type ReadResult, readAscXml } from "./read.ts";
import {
  buildWeeklySlots,
  type InternalOverlap,
  type SlotIssue,
  type WeeklyGrid,
  type WeeklySlot,
} from "./slots.ts";
import { describeSlotIssue, describeWarningCode, type ImportWarning } from "./warnings.ts";

const MAX_EXAMPLES = 5;
const ALL_TERMS_LABEL = "Todas as durações";

type WarningGroup = {
  /** `xml`: aviso da leitura/normalização; `grade`: problema ao montar a grade semanal. */
  source: "xml" | "grade";
  /** Seção do arquivo a que o aviso se refere (ex.: `lessons`, `cards`). */
  section: string;
  code: string;
  count: number;
  /** Até 5 referências, no formato `id`, `id (atributo)`, `atributo` ou a seção; nunca dados pessoais. */
  examples: string[];
  message: string;
};

export type ImportPreview = {
  counts: {
    periods: number;
    classrooms: number;
    teachers: number;
    subjects: number;
    classes: number;
    lessons: number;
    cards: number;
    slots: number;
  };
  slotsByStatus: { applicable: number; no_room: number; multiple_rooms: number };
  warnings: WarningGroup[];
  /** Contagens exatas; `overlapsDetail` guarda só os primeiros pares. */
  overlaps: { certain: number; possible: number };
  /** `true` quando `overlapsDetail` tem menos pares que `overlaps.certain + overlaps.possible`. */
  overlapsTruncated: boolean;
  /** `true` quando o arquivo foi lido só em parte (ex.: `too_many_cards`). */
  partial: boolean;
  /** Uma entrada por `termsMask` distinta entre os slots; `slots` conta slots (cards consecutivos já mesclados). */
  termsUsed: Array<{ mask: string; label: string; slots: number }>;
  /** Apenas períodos utilizáveis (número único, fim depois do início), em ordem de relógio. */
  periods: Period[];
  classrooms: Array<{ id: string; short: string; name: string; slots: number }>;
  timetable: AscTimetable;
  slots: WeeklySlot[];
  overlapsDetail: InternalOverlap[];
};

type Entry = {
  source: WarningGroup["source"];
  section: string;
  code: string;
  ref: string;
  message: string;
};

const ISSUE_SECTIONS: Record<SlotIssue["code"], string> = {
  missing_period: "cards",
  invalid_days: "cards",
  never_scheduled: "cards",
  incomplete_block: "lessons",
  lesson_without_cards: "lessons",
  invalid_period: "periods",
};

function exampleOf(warning: ImportWarning): string {
  if (warning.ref !== undefined) {
    return warning.detail === undefined ? warning.ref : `${warning.ref} (${warning.detail})`;
  }
  return warning.detail ?? warning.section;
}

function groupWarnings(entries: Entry[]): WarningGroup[] {
  const groups = new Map<string, WarningGroup>();
  for (const entry of entries) {
    const key = JSON.stringify([entry.source, entry.section, entry.code]);
    let group = groups.get(key);
    if (group === undefined) {
      group = {
        source: entry.source,
        section: entry.section,
        code: entry.code,
        count: 0,
        examples: [],
        message: entry.message,
      };
      groups.set(key, group);
    }
    group.count += 1;
    if (group.examples.length < MAX_EXAMPLES && !group.examples.includes(entry.ref)) {
      group.examples.push(entry.ref);
    }
  }
  return [...groups.values()];
}

function collectWarnings(warnings: ImportWarning[], grid: WeeklyGrid): WarningGroup[] {
  const entries: Entry[] = [
    ...warnings.map((w) => ({
      source: "xml" as const,
      section: w.section,
      code: w.code,
      ref: exampleOf(w),
      message: describeWarningCode(w.code),
    })),
    ...grid.issues.map((issue) => ({
      source: "grade" as const,
      section: ISSUE_SECTIONS[issue.code],
      code: issue.code,
      ref: issue.ref,
      message: describeSlotIssue(issue.code),
    })),
  ];
  return groupWarnings(entries);
}

function usedTerms(timetable: AscTimetable, slots: WeeklySlot[]): ImportPreview["termsUsed"] {
  const counts = new Map<string, number>();
  for (const slot of slots) {
    const mask = slot.termsMask ?? "";
    counts.set(mask, (counts.get(mask) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([mask, count]) => {
      const def = timetable.terms.find((term) => term.masks.includes(mask));
      const label = mask === "" ? ALL_TERMS_LABEL : (def?.name ?? mask);
      return { mask, label, slots: count };
    });
}

/** Monta a prévia agregada a partir da grade normalizada. Pura. */
export function buildImportPreview(
  timetable: AscTimetable,
  warnings: ImportWarning[],
  grid: WeeklyGrid,
): ImportPreview {
  const { slots } = grid;
  const slotsByStatus = { applicable: 0, no_room: 0, multiple_rooms: 0 };
  for (const slot of slots) slotsByStatus[slot.status] += 1;
  return {
    counts: {
      periods: timetable.periods.length,
      classrooms: timetable.classrooms.length,
      teachers: timetable.teachers.length,
      subjects: timetable.subjects.length,
      classes: timetable.classes.length,
      lessons: timetable.lessons.length,
      cards: timetable.cards.length,
      slots: slots.length,
    },
    slotsByStatus,
    warnings: collectWarnings(warnings, grid),
    overlaps: grid.overlapCounts,
    overlapsTruncated: grid.overlapsTruncated,
    partial: warnings.some((warning) => warning.code === "too_many_cards"),
    termsUsed: usedTerms(timetable, slots),
    periods: grid.periods,
    classrooms: timetable.classrooms.map((room) => ({
      id: room.id,
      short: room.short,
      name: room.name,
      slots: slots.filter((slot) => slot.classroomIds.includes(room.id)).length,
    })),
    timetable,
    slots,
    overlapsDetail: grid.overlaps,
  };
}

type PreviewResult = Exclude<ReadResult, { ok: true }> | { ok: true; preview: ImportPreview };

/**
 * Lê, normaliza e agrega. Rejeita o arquivo inteiro apenas pelos motivos de `readAscXml`; qualquer
 * falha inesperada vira `internal_error` (defesa em profundidade, sem expor a causa).
 */
export function previewAscXml(bytes: Uint8Array): PreviewResult {
  try {
    const read = readAscXml(bytes);
    if (!read.ok) return read;
    const { timetable, warnings } = normalizeAsc(read.root);
    return {
      ok: true,
      preview: buildImportPreview(timetable, warnings, buildWeeklySlots(timetable)),
    };
  } catch {
    return { ok: false, error: rejection("internal_error") };
  }
}
