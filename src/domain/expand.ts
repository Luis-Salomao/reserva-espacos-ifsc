import { datesOnWeekday } from "./calendar";
import type { Semester } from "./semester";

/** Parte de um slot semanal que a expansão usa (compatível com `WeeklySlot` do import-asc). */
export type ExpandableSlot = {
  /** 0 = segunda-feira. */
  weekday: number;
  /** Posição p (1-based) = duração p do semestre; `null` = todas as durações configuradas. */
  termsMask: string | null;
  segments: ReadonlyArray<{ period: number; start: string; end: string }>;
};

export type Occurrence = { date: string; start: string; end: string; period: number };

function markedPositions(mask: string): number[] {
  const positions: number[] = [];
  for (let index = 0; index < mask.length; index++) {
    if (mask[index] === "1") positions.push(index + 1);
  }
  return positions;
}

/**
 * Posições marcadas em `termsMask` sem duração configurada no semestre. Com máscara nula nunca
 * falta nada (usa o que houver configurado, ou o semestre inteiro se não houver nenhuma).
 */
export function missingTerms(slot: ExpandableSlot, semester: Semester): number[] {
  if (slot.termsMask === null) return [];
  const configured = new Set(semester.terms.map((term) => term.position));
  return markedPositions(slot.termsMask).filter((position) => !configured.has(position));
}

function laterDate(a: string, b: string): string {
  return a < b ? b : a;
}

function earlierDate(a: string, b: string): string {
  return a > b ? b : a;
}

/** Intervalos de datas em que o slot vale, recortados pela vigência do semestre. */
function validRanges(slot: ExpandableSlot, semester: Semester): Array<[string, string]> {
  let terms = semester.terms;
  if (slot.termsMask !== null) {
    const wanted = new Set(markedPositions(slot.termsMask));
    terms = terms.filter((term) => wanted.has(term.position));
  }
  const ranges: Array<[string, string]> =
    slot.termsMask === null && semester.terms.length === 0
      ? [[semester.start, semester.end]]
      : terms.map((term) => [term.start, term.end]);
  return ranges.map(([from, to]) => [
    laterDate(from, semester.start),
    earlierDate(to, semester.end),
  ]);
}

/**
 * Ocorrências concretas de um slot semanal: uma por segmento (nunca o bloco mesclado, para o
 * intervalo entre blocos ficar livre) em cada data do dia da semana que cai numa duração marcada
 * em `termsMask`. Se alguma duração marcada não tem datas configuradas devolve vazio: o slot é
 * não aplicável (ver `missingTerms`), nada é inventado. Ordenado por data e depois por segmento.
 */
export function expandSlotDates(slot: ExpandableSlot, semester: Semester): Occurrence[] {
  if (missingTerms(slot, semester).length > 0) return [];
  const dates = new Set<string>();
  for (const [from, to] of validRanges(slot, semester)) {
    for (const date of datesOnWeekday(from, to, slot.weekday)) dates.add(date);
  }
  const occurrences: Occurrence[] = [];
  for (const date of [...dates].sort()) {
    for (const segment of slot.segments) {
      occurrences.push({ date, start: segment.start, end: segment.end, period: segment.period });
    }
  }
  return occurrences;
}
