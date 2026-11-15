import type { BookingsContext } from "#/application/bookings/context";
import {
  blocksFor,
  buildDay,
  byNaturalName,
  semesterFor,
  splitTitles,
  toItem,
} from "#/application/bookings/presenters";
import { canBook, FORBIDDEN_BOOK } from "#/application/bookings/rules";
import type {
  AgendaItem,
  DayAgenda,
  RoomsDay,
  RoomsRange,
  WeekAgenda,
} from "#/application/bookings/types";
import { fail, ok, type Result } from "#/application/validation";
import { addDays, datesBetween, weekdayOf } from "#/domain/calendar";
import { equipmentForViewer } from "#/domain/equipment";
import { rangeIssue } from "#/domain/overview";
import { isValidDate } from "#/domain/semester";
import type { User } from "#/domain/user";

/** Consultas de agenda: um espaço (dia/semana), visão geral das salas e disciplinas importadas. */
export function queryOperations(ctx: BookingsContext) {
  const { occupations, spaces, semesters, hours, nowLocal, peopleFor, spaceName } = ctx;

  return {
    /** Agenda de um dia de um espaço. `viewer` é `null` para visitante. */
    async dayAgenda(
      viewer: User | null,
      input: { spaceId: string; date: string },
    ): Promise<Result<DayAgenda>> {
      if (!isValidDate(input.date)) return fail("validation", "Informe uma data válida.", "date");
      if ((await spaceName(input.spaceId)) === null) {
        return fail("not_found", "Espaço não encontrado.");
      }
      const now = nowLocal();
      const [found, all, people] = await Promise.all([
        occupations.listActiveInRange(
          input.spaceId,
          `${input.date}T00:00`,
          `${addDays(input.date, 1)}T00:00`,
        ),
        semesters.list(),
        peopleFor(viewer),
      ]);
      const items = found.map((item) => toItem(item, viewer, now, people));
      return ok(buildDay(input.spaceId, input.date, now, hours, items, all));
    },

    /** Sete dias a partir de `weekStart` (obrigatoriamente uma segunda-feira), com uma única consulta de ocupações. */
    async weekAgenda(
      viewer: User | null,
      input: { spaceId: string; weekStart: string },
    ): Promise<Result<WeekAgenda>> {
      if (!isValidDate(input.weekStart)) {
        return fail("validation", "Informe uma data válida.", "weekStart");
      }
      if (weekdayOf(input.weekStart) !== 0) {
        return fail("validation", "A semana deve começar numa segunda-feira.", "weekStart");
      }
      if ((await spaceName(input.spaceId)) === null) {
        return fail("not_found", "Espaço não encontrado.");
      }
      const now = nowLocal();
      const [found, all, people] = await Promise.all([
        occupations.listActiveInRange(
          input.spaceId,
          `${input.weekStart}T00:00`,
          `${addDays(input.weekStart, 7)}T00:00`,
        ),
        semesters.list(),
        peopleFor(viewer),
      ]);
      const byDate = new Map<string, AgendaItem[]>();
      for (const item of found) {
        const view = toItem(item, viewer, now, people);
        const list = byDate.get(view.date);
        if (list) list.push(view);
        else byDate.set(view.date, [view]);
      }
      const days: DayAgenda[] = [];
      for (let offset = 0; offset < 7; offset++) {
        const date = addDays(input.weekStart, offset);
        days.push(buildDay(input.spaceId, date, now, hours, byDate.get(date) ?? [], all));
      }
      return ok({ spaceId: input.spaceId, weekStart: input.weekStart, now, days });
    },

    /**
     * Um dia de todas as salas, em ordem natural de nome, com uma única consulta de ocupações.
     * Fora de qualquer semestre o dia vem sem grade de blocos.
     */
    async roomsDay(viewer: User | null, input: { date: string }): Promise<Result<RoomsDay>> {
      if (!isValidDate(input.date)) return fail("validation", "Informe uma data válida.", "date");
      const now = nowLocal();
      const [list, found, all, people] = await Promise.all([
        spaces.listWithEquipment(),
        occupations.listActiveInRangeAll(`${input.date}T00:00`, `${addDays(input.date, 1)}T00:00`),
        semesters.list(),
        peopleFor(viewer),
      ]);
      const covering = all.filter(
        (semester) => semester.start <= input.date && input.date <= semester.end,
      );
      const bySpace = new Map<string, AgendaItem[]>();
      for (const item of found) {
        const view = toItem(item, viewer, now, people);
        const items = bySpace.get(item.spaceId);
        if (items) items.push(view);
        else bySpace.set(item.spaceId, [view]);
      }
      const rooms = [...list]
        .sort((a, b) => byNaturalName.compare(a.name, b.name))
        .map((space) => ({
          ...buildDay(space.id, input.date, now, hours, bySpace.get(space.id) ?? [], covering),
          space: {
            id: space.id,
            name: space.name,
            capacity: space.capacity,
            equipment: equipmentForViewer(space.equipment, viewer !== null),
          },
        }));
      return ok({ date: input.date, now, rooms });
    },

    /**
     * Todas as salas nos dias de `from` a `to` (inclusive, no máximo `MAX_RANGE_DAYS`), com uma
     * única consulta de ocupações. Cada dia traz os blocos só do semestre que o cobre; fora de
     * semestre e em sábado e domingo, nenhum (as ocupações desses dias aparecem como "fora dos blocos").
     */
    async roomsRange(
      viewer: User | null,
      input: { from: string; to: string },
    ): Promise<Result<RoomsRange>> {
      if (!isValidDate(input.from)) return fail("validation", "Informe uma data válida.", "from");
      if (!isValidDate(input.to)) return fail("validation", "Informe uma data válida.", "to");
      const issue = rangeIssue(input.from, input.to);
      if (issue !== null) return fail("validation", issue, "to");
      const now = nowLocal();
      const [list, found, all, people] = await Promise.all([
        spaces.listWithEquipment(),
        occupations.listActiveInRangeAll(`${input.from}T00:00`, `${addDays(input.to, 1)}T00:00`),
        semesters.list(),
        peopleFor(viewer),
      ]);
      const days = datesBetween(input.from, input.to).map((date) => {
        const covering = all.filter((semester) => semester.start <= date && date <= semester.end);
        return { date, blocks: weekdayOf(date) > 4 ? [] : blocksFor(date, covering) };
      });
      const bySpace = new Map<string, AgendaItem[]>();
      for (const item of found) {
        const view = toItem(item, viewer, now, people);
        const items = bySpace.get(item.spaceId);
        if (items) items.push(view);
        else bySpace.set(item.spaceId, [view]);
      }
      const rooms = [...list]
        .sort((a, b) => byNaturalName.compare(a.name, b.name))
        .map((space) => ({
          space: {
            id: space.id,
            name: space.name,
            capacity: space.capacity,
            equipment: equipmentForViewer(space.equipment, viewer !== null),
          },
          occupations: bySpace.get(space.id) ?? [],
        }));
      return ok({ from: input.from, to: input.to, now, days, rooms });
    },

    /**
     * Títulos das aulas importadas ativas do semestre da data: as do docente primeiro, sem repetir
     * em "todas". Fora de qualquer semestre, usa o mais recente. Quem não pode reservar é recusado.
     */
    async subjects(
      user: User,
      input: { date: string },
    ): Promise<Result<{ mine: string[]; all: string[] }>> {
      if (!canBook(user)) return fail("forbidden", FORBIDDEN_BOOK);
      if (!isValidDate(input.date)) return fail("validation", "Informe uma data válida.", "date");
      const semester = semesterFor(input.date, await semesters.list());
      if (semester === undefined) return ok({ mine: [], all: [] });
      const pairs = await occupations.listImportedTitles(
        `${semester.start}T00:00`,
        `${addDays(semester.end, 1)}T00:00`,
      );
      return ok(splitTitles(pairs, user.id));
    },
  };
}
