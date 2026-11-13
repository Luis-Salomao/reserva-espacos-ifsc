import { freeIntervals, type Hours, type TimeRange } from "./availability";
import { addDays, datesBetween } from "./calendar";

/** Cor de uma matéria em cada tema: `light` sobre o fundo claro, `dark` sobre o escuro. */
export type Tone = { light: string; dark: string };

const SEPARATOR = " — ";

/** Contraste de pelo menos 3:1 contra `#ffffff` (`light`) e `#0e0e11` (`dark`). */
export const SUBJECT_PALETTE: readonly Tone[] = [
  { light: "#0369a1", dark: "#38bdf8" },
  { light: "#7c3aed", dark: "#a78bfa" },
  { light: "#b45309", dark: "#fbbf24" },
  { light: "#0f766e", dark: "#2dd4bf" },
  { light: "#4f46e5", dark: "#818cf8" },
  { light: "#c026d3", dark: "#e879f9" },
  { light: "#0e7490", dark: "#22d3ee" },
  { light: "#be185d", dark: "#f472b6" },
  { light: "#1d4ed8", dark: "#60a5fa" },
  { light: "#6b21a8", dark: "#c084fc" },
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

/** Tamanho máximo do intervalo da visão geral, em dias (inclusive as duas pontas). */
export const MAX_RANGE_DAYS = 31;

/** Dias do intervalo padrão: de hoje até hoje + 6. */
const DEFAULT_RANGE_DAYS = 7;

/** Intervalo padrão da visão geral: `today` e os seis dias seguintes. */
export function defaultRange(today: string): { from: string; to: string } {
  return { from: today, to: addDays(today, DEFAULT_RANGE_DAYS - 1) };
}

/**
 * Intervalo mostrado: `de` e `ate` da URL; só `de`, até `de` + 6; sem `de`, o padrão a partir de
 * `today`. Espera o que `rangeIssue` já aprovou.
 */
export function resolveRange(
  de: string | undefined,
  ate: string | undefined,
  today: string,
): { from: string; to: string } {
  if (de === undefined) return defaultRange(today);
  return { from: de, to: ate ?? defaultRange(de).to };
}

/** Quantos dias o intervalo tem, contando as duas pontas. Espera datas válidas e `from <= to`. */
export function rangeLength(from: string, to: string): number {
  return datesBetween(from, to).length;
}

/** Mensagem do problema do intervalo (datas já válidas): início depois do fim ou longo demais. */
export function rangeIssue(from: string, to: string): string | null {
  if (from > to) return "A data inicial deve ser anterior ou igual à final.";
  if (rangeLength(from, to) > MAX_RANGE_DAYS) {
    return `O intervalo pode ter no máximo ${MAX_RANGE_DAYS} dias.`;
  }
  return null;
}

/** Desloca o intervalo pelo próprio tamanho: `direction` -1 (anterior) ou 1 (próximo). */
export function shiftRange(
  from: string,
  to: string,
  direction: -1 | 1,
): { from: string; to: string } {
  const length = rangeLength(from, to) * direction;
  return { from: addDays(from, length), to: addDays(to, length) };
}

/** Do início do bloco `from` ao fim do bloco `to`, em qualquer ordem; `null` se algum não existe. */
export function spanOf(blocks: readonly TimeRange[], from: number, to: number): TimeRange | null {
  const first = blocks[Math.min(from, to)];
  const last = blocks[Math.max(from, to)];
  return first === undefined || last === undefined ? null : { start: first.start, end: last.end };
}

/** A semana não traz o expediente das salas; a reserva confere o expediente real. */
const WHOLE_DAY: Hours = { opens: "00:00", closes: "23:59" };

type WeekRoom = {
  space: { id: string };
  occupations: readonly (TimeRange & { date: string })[];
};

/** As salas num dia da semana, no formato de `availabilityIn`: ocupações do dia e o que sobra livre. */
export function roomsOnDay<R extends WeekRoom>(
  rooms: readonly R[],
  date: string,
): Array<
  R & {
    spaceId: string;
    date: string;
    occupations: Array<R["occupations"][number]>;
    free: TimeRange[];
  }
> {
  return rooms.map((room) => {
    const occupations = room.occupations.filter((item) => item.date === date);
    return {
      ...room,
      spaceId: room.space.id,
      date,
      occupations,
      free: freeIntervals(WHOLE_DAY, occupations),
    };
  });
}
