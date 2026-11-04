import { addDays, weekdayOf } from "./calendar";
import { isValidDate } from "./semester";

/**
 * `workdays`: segunda a sexta. `weekly`: os `weekdays` marcados (segunda = 0) a cada `interval`
 * semanas. `monthly-day`: o mesmo dia do mês da data inicial. `monthly-weekday`: a Nª ocorrência
 * do dia da semana da data inicial (N = semana do mês em que ela cai).
 */
export type RecurrenceFreq = "workdays" | "weekly" | "monthly-day" | "monthly-weekday";

export type RecurrenceEnd = { kind: "until"; date: string } | { kind: "count"; count: number };

export type Recurrence = {
  freq: RecurrenceFreq;
  /** Só em `weekly`: 1 = toda semana, 2 = semana sim, semana não… */
  interval: number;
  /** Só em `weekly`. */
  weekdays: number[];
  end: RecurrenceEnd;
};

export const MAX_OCCURRENCES = 120;
/** A última data fica no máximo a tantos dias da data inicial. */
export const MAX_SPAN_DAYS = 365;
export const MAX_INTERVAL = 12;

export type Expansion = { ok: true; dates: string[] } | { ok: false; message: string };

const WEEKDAY_NAMES = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"];

/** Semana do mês (1 a 5) em que a data cai: dias 1–7 = 1ª, 8–14 = 2ª… */
export function weekOfMonth(date: string): number {
  return Math.ceil(Number(date.slice(8, 10)) / 7);
}

function weeklyMatcher(start: string, rule: Recurrence): (date: string, offset: number) => boolean {
  const shift = weekdayOf(start);
  const days = new Set(rule.weekdays);
  return (date, offset) =>
    days.has(weekdayOf(date)) && Math.floor((offset + shift) / 7) % rule.interval === 0;
}

/** Datas da regra semanal ou de dia útil, de `start` a `last`, inclusive. */
function dailyScan(start: string, last: string, rule: Recurrence, limit: number): string[] {
  const matches =
    rule.freq === "workdays" ? (date: string) => weekdayOf(date) < 5 : weeklyMatcher(start, rule);
  const dates: string[] = [];
  for (let offset = 0, date = start; date <= last && dates.length < limit; offset++) {
    if (matches(date, offset)) dates.push(date);
    date = addDays(date, 1);
  }
  return dates;
}

function monthDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Nª ocorrência do dia da semana no mês, ou `null` se o mês não a tem. */
function nthWeekday(year: number, month: number, weekday: number, nth: number): string | null {
  const first = monthDate(year, month, 1);
  const day = 1 + ((weekday - weekdayOf(first) + 7) % 7) + 7 * (nth - 1);
  const date = monthDate(year, month, day);
  return isValidDate(date) ? date : null;
}

/** Datas mensais de `start` a `last`; meses sem a data são pulados. */
function monthlyScan(start: string, last: string, rule: Recurrence, limit: number): string[] {
  const day = Number(start.slice(8, 10));
  const weekday = weekdayOf(start);
  const nth = weekOfMonth(start);
  let year = Number(start.slice(0, 4));
  let month = Number(start.slice(5, 7));
  const dates: string[] = [];
  while (dates.length < limit && monthDate(year, month, 1) <= last) {
    const candidate =
      rule.freq === "monthly-day"
        ? monthDate(year, month, day)
        : nthWeekday(year, month, weekday, nth);
    if (candidate !== null && isValidDate(candidate) && candidate <= last) dates.push(candidate);
    month++;
    if (month > 12) {
      month = 1;
      year++;
    }
  }
  return dates;
}

function ruleIssue(start: string, rule: Recurrence): string | null {
  if (rule.freq === "weekly") {
    if (!Number.isInteger(rule.interval) || rule.interval < 1 || rule.interval > MAX_INTERVAL) {
      return `O intervalo deve ser de 1 a ${MAX_INTERVAL} semanas.`;
    }
    if (
      rule.weekdays.length === 0 ||
      rule.weekdays.some((d) => !Number.isInteger(d) || d < 0 || d > 6)
    ) {
      return "Marque ao menos um dia da semana.";
    }
  }
  if (rule.end.kind === "until") {
    if (!isValidDate(rule.end.date)) return "Informe uma data final válida.";
    if (rule.end.date < start) return "A data final deve ser igual ou posterior à data inicial.";
    if (rule.end.date > addDays(start, MAX_SPAN_DAYS)) {
      return `A série pode ir até ${MAX_SPAN_DAYS} dias depois da data inicial.`;
    }
  } else if (
    !Number.isInteger(rule.end.count) ||
    rule.end.count < 1 ||
    rule.end.count > MAX_OCCURRENCES
  ) {
    return `O número de ocorrências deve ser de 1 a ${MAX_OCCURRENCES}.`;
  }
  return null;
}

/**
 * Datas da série a partir de `start` (já validada), em ordem. A data inicial só entra se casar com
 * a regra. Recusa regra inválida, série vazia, mais de `MAX_OCCURRENCES` datas ou que passaria de
 * `MAX_SPAN_DAYS` dias depois da data inicial.
 */
export function expandRecurrence(start: string, rule: Recurrence): Expansion {
  const issue = ruleIssue(start, rule);
  if (issue !== null) return { ok: false, message: issue };
  const horizon = addDays(start, MAX_SPAN_DAYS);
  const last = rule.end.kind === "until" ? rule.end.date : horizon;
  const wanted = rule.end.kind === "count" ? rule.end.count : MAX_OCCURRENCES + 1;
  const scan = rule.freq === "workdays" || rule.freq === "weekly" ? dailyScan : monthlyScan;
  const dates = scan(start, last, rule, wanted);
  if (dates.length === 0) return { ok: false, message: "Nenhuma data corresponde à repetição." };
  if (dates.length > MAX_OCCURRENCES) {
    return { ok: false, message: `A série pode ter no máximo ${MAX_OCCURRENCES} datas.` };
  }
  if (rule.end.kind === "count" && dates.length < rule.end.count) {
    return {
      ok: false,
      message: `A série pode ir até ${MAX_SPAN_DAYS} dias depois da data inicial.`,
    };
  }
  return { ok: true, dates };
}

function joinPt(items: readonly string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} e ${items.at(-1)}`;
}

function shortDate(date: string, withYear: boolean): string {
  const base = `${date.slice(8, 10)}/${date.slice(5, 7)}`;
  return withYear ? `${base}/${date.slice(0, 4)}` : base;
}

/** Nome da regra: "Toda terça e quinta", "A cada 2 semanas: segunda", "Todo mês na 2ª terça"… */
export function recurrenceLabel(start: string, rule: Recurrence): string {
  if (rule.freq === "workdays") return "Todo dia útil (seg. a sex.)";
  if (rule.freq === "monthly-day") return `Todo mês no dia ${Number(start.slice(8, 10))}`;
  if (rule.freq === "monthly-weekday") {
    return `Todo mês na ${weekOfMonth(start)}ª ${WEEKDAY_NAMES[weekdayOf(start)]}`;
  }
  const sorted = [...new Set(rule.weekdays)].sort((a, b) => a - b);
  const names = joinPt(sorted.map((day) => WEEKDAY_NAMES[day] ?? ""));
  if (rule.interval > 1) return `A cada ${rule.interval} semanas: ${names}`;
  return `${(sorted[0] ?? 0) >= 5 ? "Todo" : "Toda"} ${names}`;
}

/** Resumo para a tela: "Toda terça e quinta, até 18/12, 12 datas" (ano só se mudar). */
export function recurrenceSummary(
  start: string,
  rule: Recurrence,
  dates: readonly string[],
): string {
  const last = dates.at(-1) ?? start;
  const count = dates.length === 1 ? "1 data" : `${dates.length} datas`;
  return `${recurrenceLabel(start, rule)}, até ${shortDate(last, last.slice(0, 4) !== start.slice(0, 4))}, ${count}`;
}
