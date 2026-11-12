import type { AgendaItem } from "#/application/bookings";
import { isMaintenanceTitle } from "./booking-kind";
import { RESERVA_TONE, SUBJECT_PALETTE, subjectOf, subjectTone, type Tone } from "./overview";

/** Item da legenda: a chave separa "Reserva" de uma matéria com o mesmo nome. */
export type LegendEntry = { key: string; label: string; tone: Tone; pattern: number };

/** Parte da cor da disciplina misturada ao fundo do tema no cartão (tem de bater com `lib/tone-style`). */
export const TINT_PERCENT = { light: 14, dark: 16 } as const;

function subjectPattern(subject: string): number {
  let hash = 0;
  for (const char of subject) hash = (hash * 17 + (char.codePointAt(0) ?? 0)) >>> 0;
  return hash % 4;
}

/**
 * Cor de uma ocupação, num só lugar: reserva avulsa fica neutra, exceto quando usa o título
 * canônico da importação `MATÉRIA — TURMA`; nesse caso compartilha a cor da matéria.
 */
export function legendEntryOf(item: Pick<AgendaItem, "source" | "title">): LegendEntry {
  const hasImportedSubjectTitle =
    item.source === "manual" &&
    !isMaintenanceTitle(item.title) &&
    item.title.includes(" — ") &&
    item.title.slice(0, item.title.indexOf(" — ")).trim() !== "";
  if (item.source === "manual" && !hasImportedSubjectTitle)
    return { key: "reserva", label: "Reserva", tone: RESERVA_TONE, pattern: 0 };
  const subject = subjectOf(item.title);
  return {
    key: `materia:${subject}`,
    label: subject,
    tone: SUBJECT_PALETTE[subjectTone(subject)] ?? RESERVA_TONE,
    pattern: subjectPattern(subject),
  };
}

/** `true` quando a ocupação usa a cor de uma disciplina (e não a neutra de reserva). */
export function hasSubjectTone(entry: LegendEntry): boolean {
  return entry.key !== "reserva";
}

function channels(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

/** Mistura `percent`% de `tone` sobre `base` (como `color-mix(in srgb)` do cartão). */
export function tint(tone: string, base: string, percent: number): string {
  const [a, b] = [channels(tone), channels(base)];
  const mixed = a.map((value, i) =>
    Math.round((value * percent) / 100 + (b[i] as number) * (1 - percent / 100)),
  );
  return `#${mixed.map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}
