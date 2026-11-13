/**
 * Aritmética de datas "YYYY-MM-DD" sem `Date` nem fuso: o dia é um número de dias desde
 * 1970-01-01 (calendário gregoriano proléptico), então não há horário de verão nem normalização
 * automática. Espera datas já validadas (`isValidDate` em `semester.ts`).
 */

function toDayNumber(date: string): number {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

function fromDayNumber(days: number): string {
  const z = days + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365,
  );
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  const year = yoe + era * 400 + (month <= 2 ? 1 : 0);
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Dia da semana com segunda-feira = 0 (1970-01-01 foi quinta-feira). */
export function weekdayOf(date: string): number {
  return (((toDayNumber(date) + 3) % 7) + 7) % 7;
}

export function addDays(date: string, days: number): string {
  return fromDayNumber(toDayNumber(date) + days);
}

/** Datas de `from` a `to`, inclusive; vazio se `to` é anterior a `from`. */
export function datesBetween(from: string, to: string): string[] {
  const first = toDayNumber(from);
  const last = toDayNumber(to);
  const dates: string[] = [];
  for (let day = first; day <= last; day++) dates.push(fromDayNumber(day));
  return dates;
}

/** Datas de `from` a `to` (inclusive) que caem no dia da semana dado (segunda = 0). */
export function datesOnWeekday(from: string, to: string, weekday: number): string[] {
  const first = toDayNumber(from);
  const last = toDayNumber(to);
  const offset = (((weekday - (first + 3)) % 7) + 7) % 7;
  const dates: string[] = [];
  for (let day = first + offset; day <= last; day += 7) dates.push(fromDayNumber(day));
  return dates;
}

/** Normaliza qualquer data para a segunda-feira correspondente da semana. */
export function getWeekStart(date: string): string {
  return addDays(date, -weekdayOf(date));
}
