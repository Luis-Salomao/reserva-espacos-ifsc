import { weekdayOf } from "./calendar";
import { isValidDate, isValidTime } from "./semester";

/** Expediente do dia em que se pode reservar, "HH:MM". */
export type Hours = { opens: string; closes: string };

export const DEFAULT_HOURS: Hours = { opens: "06:00", closes: "23:00" };

/** Intervalo `[start, end)` de horas locais "HH:MM" dentro de um dia. */
export type TimeRange = { start: string; end: string };

/** Problema de validação com o campo da tela (`date`, `start`, `end`). */
export type BookingIssue = { field: "date" | "start" | "end"; message: string };

/**
 * Trechos livres do expediente: o que sobra depois de tirar as ocupações (intervalos meio-abertos,
 * então adjacentes não deixam vão). Recorta ocupações que passam do expediente; aceita desordem.
 */
export function freeIntervals(hours: Hours, busy: readonly TimeRange[]): TimeRange[] {
  const sorted = [...busy].sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  const free: TimeRange[] = [];
  let cursor = hours.opens;
  for (const item of sorted) {
    if (item.start >= hours.closes) break;
    if (item.start > cursor) free.push({ start: cursor, end: item.start });
    if (item.end > cursor) cursor = item.end;
  }
  if (cursor < hours.closes) free.push({ start: cursor, end: hours.closes });
  return free;
}

/** Hora de parede do fuso para o instante dado, "YYYY-MM-DDTHH:MM". */
export function localNow(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/**
 * Valida data e horários de uma reserva: data de calendário válida, "HH:MM", fim depois do início,
 * dentro do expediente e no futuro (`data + início` depois de `nowLocal`; hoje em hora futura vale).
 */
export function validateBookingWhen(
  when: { date: string; start: string; end: string },
  hours: Hours,
  nowLocal: string,
): BookingIssue | null {
  if (!isValidDate(when.date)) return { field: "date", message: "Informe uma data válida." };
  if (!isValidTime(when.start)) return { field: "start", message: "Informe o início (HH:MM)." };
  if (!isValidTime(when.end)) return { field: "end", message: "Informe o fim (HH:MM)." };
  if (when.end <= when.start) {
    return { field: "end", message: "O fim deve ser depois do início." };
  }
  if (when.start < hours.opens) {
    return { field: "start", message: `O início deve ser a partir de ${hours.opens}.` };
  }
  if (when.end > hours.closes) {
    return { field: "end", message: `O fim deve ser até ${hours.closes}.` };
  }
  if (`${when.date}T${when.start}` <= nowLocal) {
    const field = when.date < nowLocal.slice(0, 10) ? "date" : "start";
    return { field, message: "Não é possível reservar no passado." };
  }
  return null;
}

/** Dia da semana no formato do `strftime('%w')` do SQLite (domingo = 0, segunda = 1). */
export function weekdaySqlite(date: string): number {
  return (weekdayOf(date) + 1) % 7;
}
