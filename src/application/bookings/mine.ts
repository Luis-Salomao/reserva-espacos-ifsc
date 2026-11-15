import type { BookingsContext } from "#/application/bookings/context";
import { buildDay, byTitle, toMyBooking } from "#/application/bookings/presenters";
import { DEFAULT_PAGE, MAX_PAGE } from "#/application/bookings/rules";
import type {
  DayAgenda,
  MyBooking,
  MyDates,
  MySubject,
  MyWeek,
  People,
} from "#/application/bookings/types";
import type { OccupationWithSpace } from "#/application/ports";
import { fail, ok, type Result } from "#/application/validation";
import { addDays, weekdayOf } from "#/domain/calendar";
import { isValidDate } from "#/domain/semester";
import { normalizeSubject } from "#/domain/text-match";
import type { User } from "#/domain/user";

/** Consultas "minhas": reservas, disciplinas, semana e datas do usuário logado. */
export function mineOperations(ctx: BookingsContext) {
  const { occupations, semesters, hours, nowLocal, peopleFor } = ctx;

  return {
    /**
     * Próximas ocupações ativas em que o usuário é criador ou responsável. `from` ("YYYY-MM-DD")
     * começa naquele dia; sem ele, a partir de agora.
     */
    async myBookings(
      user: User,
      input: { from?: string; limit?: number; offset?: number },
    ): Promise<Result<{ items: MyBooking[]; hasMore: boolean }>> {
      if (input.from !== undefined && !isValidDate(input.from)) {
        return fail("validation", "Informe uma data válida.", "from");
      }
      const limit = input.limit ?? DEFAULT_PAGE;
      const offset = input.offset ?? 0;
      if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE) {
        return fail("validation", `O limite deve ser de 1 a ${MAX_PAGE}.`, "limit");
      }
      if (!Number.isInteger(offset) || offset < 0) {
        return fail("validation", "O deslocamento deve ser zero ou mais.", "offset");
      }
      const now = nowLocal();
      const fromLocal = input.from === undefined ? now : `${input.from}T00:00`;
      const [rows, people]: [OccupationWithSpace[], People] = await Promise.all([
        occupations.listMine(user.id, fromLocal, limit + 1, offset),
        peopleFor(user),
      ]);
      const items = rows.slice(0, limit).map((row) => toMyBooking(row, user, now, people));
      return ok({ items, hasMore: rows.length > limit });
    },

    /** Disciplinas futuras do usuário, agrupadas por título normalizado. */
    async mySubjects(user: User): Promise<Result<{ subjects: MySubject[] }>> {
      const titles = await occupations.listMineTitles(user.id, nowLocal());
      const groups = new Map<string, Map<string, number>>();
      for (const title of titles) {
        const key = normalizeSubject(title);
        const variants = groups.get(key) ?? new Map<string, number>();
        variants.set(title, (variants.get(title) ?? 0) + 1);
        groups.set(key, variants);
      }
      const subjects: MySubject[] = [];
      for (const [key, variants] of groups) {
        let label = "";
        let best = 0;
        let count = 0;
        for (const title of [...variants.keys()].sort((x, y) => byTitle.compare(x, y))) {
          const n = variants.get(title) ?? 0;
          count += n;
          if (n > best) {
            best = n;
            label = title;
          }
        }
        subjects.push({ key, label, count });
      }
      subjects.sort((x, y) => byTitle.compare(x.label, y.label));
      return ok({ subjects });
    },

    /** Semana (segunda a domingo) com as ocupações do usuário em todas as salas. */
    async myWeek(
      user: User,
      input: { weekStart: string; subject?: string },
    ): Promise<Result<MyWeek>> {
      if (!isValidDate(input.weekStart)) {
        return fail("validation", "Informe uma data válida.", "weekStart");
      }
      if (weekdayOf(input.weekStart) !== 0) {
        return fail("validation", "A semana deve começar numa segunda-feira.", "weekStart");
      }
      const now = nowLocal();
      const [rows, all, people] = await Promise.all([
        occupations.listMineInRange(
          user.id,
          `${input.weekStart}T00:00`,
          `${addDays(input.weekStart, 7)}T00:00`,
        ),
        semesters.list(),
        peopleFor(user),
      ]);
      const normalized = input.subject === undefined ? "" : normalizeSubject(input.subject);
      const wanted = normalized === "" ? null : normalized;
      const items = rows
        .map((row) => toMyBooking(row, user, now, people))
        .filter((item) => wanted === null || normalizeSubject(item.title) === wanted);
      const days: DayAgenda[] = [];
      for (let offset = 0; offset < 7; offset++) {
        const date = addDays(input.weekStart, offset);
        const day = items.filter((item) => item.date === date);
        days.push({ ...buildDay("", date, now, hours, day, all), free: [] });
      }
      return ok({ spaceId: "", weekStart: input.weekStart, now, days, items });
    },

    /** Datas futuras (até 190 dias) de uma disciplina do usuário. */
    async myDates(user: User, input: { subject: string }): Promise<Result<MyDates>> {
      const wanted = normalizeSubject(input.subject);
      if (wanted === "") return fail("validation", "Escolha uma disciplina.", "subject");
      const now = nowLocal();
      const end = `${addDays(now.slice(0, 10), 190)}${now.slice(10)}`;
      const [rows, people] = await Promise.all([
        occupations.listMineInRange(user.id, now, end),
        peopleFor(user),
      ]);
      const items = rows
        .filter((row) => normalizeSubject(row.title) === wanted)
        .map((row) => toMyBooking(row, user, now, people))
        .sort((x, y) => `${x.date}T${x.start}`.localeCompare(`${y.date}T${y.start}`));
      return ok({ now, items });
    },
  };
}
