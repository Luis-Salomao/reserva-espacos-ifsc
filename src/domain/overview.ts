import type { TimeRange } from "./availability";
import { addDays, weekdayOf } from "./calendar";

/** Cor de uma matéria em cada tema: `light` sobre o fundo claro, `dark` sobre o escuro. */
type Tone = { light: string; dark: string };

const SEPARATOR = " — ";

/** Contraste de pelo menos 3:1 contra `#ffffff` (`light`) e `#0e0e11` (`dark`). */
export const SUBJECT_PALETTE: readonly Tone[] = [
  { light: "#0369a1", dark: "#38bdf8" },
  { light: "#7c3aed", dark: "#a78bfa" },
  { light: "#047857", dark: "#34d399" },
  { light: "#b45309", dark: "#fbbf24" },
  { light: "#e11d48", dark: "#fb7185" },
  { light: "#0f766e", dark: "#2dd4bf" },
  { light: "#4f46e5", dark: "#818cf8" },
  { light: "#4d7c0f", dark: "#a3e635" },
  { light: "#c026d3", dark: "#e879f9" },
  { light: "#c2410c", dark: "#fb923c" },
  { light: "#0e7490", dark: "#22d3ee" },
  { light: "#be185d", dark: "#f472b6" },
];

/** Cor neutra das reservas avulsas. */
export const RESERVA_TONE: Tone = { light: "#6b7280", dark: "#9ca3af" };

/** Matéria do título importado (`MATÉRIA — TURMA`); sem matéria, o título inteiro aparado. */
export function subjectOf(title: string): string {
  const cut = title.indexOf(SEPARATOR);
  const subject = cut === -1 ? "" : title.slice(0, cut).trim();
  return subject === "" ? title.trim() : subject;
}

/** Mesma matéria, mesmo índice em `SUBJECT_PALETTE` (hash estável do nome). */
export function subjectTone(subject: string): number {
  let hash = 0;
  for (const char of subject) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  return hash % SUBJECT_PALETTE.length;
}

function luminance(hex: string): number {
  const channel = (offset: number) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** Razão de contraste da WCAG entre duas cores `#rrggbb`. */
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

export type Cell<I, B> = { block: B; items: Array<{ item: I; partial: boolean }> };

/**
 * Por bloco, as ocupações que o cruzam (na ordem recebida), com `partial` quando não cobrem o
 * bloco inteiro. `outside`: as que não cruzam nenhum bloco (no intervalo ou fora da grade).
 */
export function cellsFor<I extends TimeRange, B extends TimeRange>(
  items: readonly I[],
  blocks: readonly B[],
): { cells: Cell<I, B>[]; outside: I[] } {
  const crosses = (item: I, block: B) => item.start < block.end && item.end > block.start;
  const cells = blocks.map((block) => ({
    block,
    items: items
      .filter((item) => crosses(item, block))
      .map((item) => ({ item, partial: item.start > block.start || item.end < block.end })),
  }));
  const outside = items.filter((item) => !blocks.some((block) => crosses(item, block)));
  return { cells, outside };
}

/** Segunda a sexta da semana da data. */
export function weekOf(date: string): string[] {
  const monday = addDays(date, -weekdayOf(date));
  return [0, 1, 2, 3, 4].map((offset) => addDays(monday, offset));
}
