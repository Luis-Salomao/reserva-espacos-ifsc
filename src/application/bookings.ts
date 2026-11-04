import type {
  Clock,
  OccupationRecord,
  OccupationRepository,
  OccupationWithSpace,
  SemesterRepository,
  SpaceRepository,
  UserRepository,
} from "#/application/ports";
import { type Failure, fail, ok, parseText, type Result } from "#/application/validation";
import {
  type BookingIssue,
  freeIntervals,
  type Hours,
  localNow,
  type TimeRange,
  validateBookingWhen,
} from "#/domain/availability";
import { addDays, weekdayOf } from "#/domain/calendar";
import { CANCEL_REASONS } from "#/domain/cancel-reasons";
import { isValidDate, type Semester } from "#/domain/semester";
import type { User } from "#/domain/user";

/** Papéis que podem reservar. */
const BOOKING_ROLES = ["admin", "horarios", "docente"] as const;

const MAX_PURPOSE = 120;
const DEFAULT_PAGE = 50;
const MAX_PAGE = 100;
const SERIES_ON_MANUAL = "Reservas avulsas não têm série; cancele apenas esta data.";
const FORBIDDEN_BOOK = "Sem permissão para reservar.";
const FORBIDDEN_CANCEL = "Sem permissão para cancelar esta ocupação.";
const ENDED = "Esta ocupação já terminou e não pode ser cancelada.";
const ALREADY_CANCELLED = "Esta ocupação já foi cancelada.";
const SERIES_CHANGED = "A série mudou desde a confirmação. Revise as datas e confirme de novo.";
const RACE_LOST = "O horário foi ocupado por outra reserva. Atualize a agenda e escolha outro.";

/**
 * Pessoa ligada à ocupação: responsável (importada) ou quem reservou (avulsa). `placeholder`:
 * conta fantasma, criada pela importação e ainda não ativada.
 */
export type AgendaPerson = { name: string; code: string | null; placeholder: boolean };

/**
 * Item da agenda, sem ids de pessoas. `person` só vem para quem está logado (visitante recebe
 * `null`); `mine`/`canCancel` valem para quem consulta.
 */
export type AgendaItem = {
  id: string;
  /** "YYYY-MM-DD". */
  date: string;
  /** "HH:MM". */
  start: string;
  end: string;
  title: string;
  source: "import" | "manual";
  status: "ativa";
  canCancel: boolean;
  mine: boolean;
  person: AgendaPerson | null;
};

type AgendaBlock = { label: string; short: string; start: string; end: string };

export type DayAgenda = {
  spaceId: string;
  date: string;
  /** Agora em hora de parede do TIMEZONE ("YYYY-MM-DDTHH:MM"): a tela desabilita o horário passado. */
  now: string;
  hours: Hours;
  occupations: AgendaItem[];
  free: TimeRange[];
  /** Blocos de horário do semestre, só para exibir a grade (intervalos entre eles ficam livres). */
  blocks: AgendaBlock[];
};

export type WeekAgenda = {
  spaceId: string;
  weekStart: string;
  now: string;
  days: DayAgenda[];
};

/** Agenda de um dia de uma sala, com o nome e a capacidade (`null` = não cadastrada). */
export type RoomDay = DayAgenda & { space: { id: string; name: string; capacity: number | null } };

export type RoomsDay = { date: string; now: string; rooms: RoomDay[] };

export type BookingView = {
  id: string;
  spaceId: string;
  date: string;
  start: string;
  end: string;
  title: string;
};

type ConflictInfo = {
  title: string;
  spaceName: string;
  date: string;
  start: string;
  end: string;
};

/** Falha de conflito carrega a ocupação que bloqueou (título e horários, sem pessoas). */
type BookingFailure = Failure & { conflict?: ConflictInfo };
export type BookingResult = { ok: true; value: BookingView } | BookingFailure;

export type MyBooking = AgendaItem & { spaceId: string; spaceName: string };

export type BookingsDeps = {
  occupations: OccupationRepository;
  spaces: SpaceRepository;
  semesters: SemesterRepository;
  users: Pick<UserRepository, "list">;
  clock: Clock;
  /** TIMEZONE: define "hoje" e "agora" em hora de parede. */
  timeZone: string;
  hours: Hours;
};

export type CancelScope = "data" | "serie";

function validationFrom(issue: BookingIssue): Failure {
  return fail("validation", issue.message, issue.field);
}

function canBook(user: User): boolean {
  return (
    user.active && user.roles.some((role) => (BOOKING_ROLES as readonly string[]).includes(role))
  );
}

/** Criador de avulsa, responsável de importada ou admin. */
function ownsOccupation(user: User, item: OccupationRecord): boolean {
  if (!user.active) return false;
  if (user.roles.includes("admin")) return true;
  return item.source === "manual" ? item.createdBy === user.id : item.responsibleUserId === user.id;
}

/** Restrição de posse da série: `null` para admin (série inteira), senão o próprio usuário. */
function seriesOwner(user: User): string | null {
  return user.roles.includes("admin") ? null : user.id;
}

function isMine(user: User | null, item: OccupationRecord): boolean {
  return user !== null && (item.createdBy === user.id || item.responsibleUserId === user.id);
}

type People = ReadonlyMap<string, AgendaPerson>;

const NO_PEOPLE: People = new Map();

function personOf(item: OccupationRecord, people: People): AgendaPerson | null {
  const id = item.source === "manual" ? item.createdBy : item.responsibleUserId;
  return id === null ? null : (people.get(id) ?? null);
}

function toItem(
  item: OccupationRecord,
  viewer: User | null,
  nowLocal: string,
  people: People,
): AgendaItem {
  return {
    id: item.id,
    date: item.startsAt.slice(0, 10),
    start: item.startsAt.slice(11, 16),
    end: item.endsAt.slice(11, 16),
    title: item.title,
    source: item.source,
    status: "ativa",
    canCancel: viewer !== null && item.endsAt > nowLocal && ownsOccupation(viewer, item),
    mine: isMine(viewer, item),
    person: viewer === null ? null : personOf(item, people),
  };
}

/** Blocos do semestre que cobre a data; sem cobertura, os do semestre mais recente; sem semestre, nenhum. */
function blocksFor(date: string, semesters: readonly Semester[]): AgendaBlock[] {
  const chosen =
    semesters.find((semester) => semester.start <= date && date <= semester.end) ?? semesters[0];
  return (chosen?.blocks ?? []).map((block) => ({
    label: block.name,
    short: block.short,
    start: block.start,
    end: block.end,
  }));
}

/** Ordem natural de nomes: "A-202" antes de "A-1000". */
const byNaturalName = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" });

function buildDay(
  spaceId: string,
  date: string,
  now: string,
  hours: Hours,
  items: readonly AgendaItem[],
  semesters: readonly Semester[],
): DayAgenda {
  return {
    spaceId,
    date,
    now,
    hours,
    occupations: [...items],
    free: freeIntervals(hours, items),
    blocks: blocksFor(date, semesters),
  };
}

export function createBookingsService(deps: BookingsDeps) {
  const { occupations, spaces, semesters, users, clock, timeZone, hours } = deps;

  const nowLocal = () => localNow(clock.now(), timeZone);

  /** Nomes só para quem está logado; o visitante nem dispara a consulta. */
  async function peopleFor(viewer: User | null): Promise<People> {
    if (viewer === null) return NO_PEOPLE;
    const all = await users.list();
    return new Map(
      all.map((user) => [
        user.id,
        { name: user.name, code: user.code, placeholder: user.placeholder },
      ]),
    );
  }

  async function spaceName(spaceId: string): Promise<string | null> {
    const found = (await spaces.list()).find((space) => space.id === spaceId);
    return found?.name ?? null;
  }

  /** Âncora autorizada para cancelar (ou ver a série): existe, está ativa e é do usuário (ou admin). */
  async function loadCancellable(
    user: User,
    occupationId: string,
  ): Promise<Result<OccupationRecord>> {
    const anchor = await occupations.findById(occupationId);
    if (anchor === null) return fail("not_found", "Ocupação não encontrada.");
    if (!ownsOccupation(user, anchor)) return fail("forbidden", FORBIDDEN_CANCEL);
    if (anchor.status !== "ativa") return fail("conflict", ALREADY_CANCELLED);
    if (anchor.endsAt <= nowLocal()) return fail("validation", ENDED);
    return ok(anchor);
  }

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
        spaces.list(),
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
          space: { id: space.id, name: space.name, capacity: space.capacity },
        }));
      return ok({ date: input.date, now, rooms });
    },

    /**
     * Reserva avulsa. A gravação é uma única instrução condicional (nenhuma ocupação ativa
     * sobreposta), então de duas reservas concorrentes conflitantes só uma é confirmada.
     */
    async createBooking(
      user: User,
      input: { spaceId: string; date: string; start: string; end: string; purpose: string },
    ): Promise<BookingResult> {
      if (!canBook(user)) return fail("forbidden", FORBIDDEN_BOOK);
      const purpose = parseText(input.purpose, MAX_PURPOSE, "A finalidade", "purpose");
      if (!purpose.ok) return purpose;
      const issue = validateBookingWhen(input, hours, nowLocal());
      if (issue !== null) return validationFrom(issue);
      const name = await spaceName(input.spaceId);
      if (name === null) return fail("not_found", "Espaço não encontrado.", "spaceId");

      const id = crypto.randomUUID();
      const startsAt = `${input.date}T${input.start}`;
      const endsAt = `${input.date}T${input.end}`;
      const result = await occupations.insertManualIfFree({
        id,
        spaceId: input.spaceId,
        startsAt,
        endsAt,
        title: purpose.value,
        createdBy: user.id,
        createdAt: clock.now().toISOString(),
      });
      if (result.inserted) {
        return ok({
          id,
          spaceId: input.spaceId,
          date: input.date,
          start: input.start,
          end: input.end,
          title: purpose.value,
        });
      }
      if (result.blocking === null) return fail("conflict", RACE_LOST);
      const conflict: ConflictInfo = {
        title: result.blocking.title,
        spaceName: name,
        date: result.blocking.startsAt.slice(0, 10),
        start: result.blocking.startsAt.slice(11, 16),
        end: result.blocking.endsAt.slice(11, 16),
      };
      return {
        ...fail(
          "conflict",
          `Conflita com ${conflict.title} — ${conflict.spaceName}, ${conflict.start}–${conflict.end}.`,
        ),
        conflict,
      };
    },

    /**
     * Cancela uma data ou a série. Série só existe para importada: mesma aula (`lesson_id`), lote,
     * espaço, dia da semana e horário, de agora em diante (corte: hora de parede atual; a âncora
     * sempre entra). O admin cancela a série inteira; os demais, só as linhas em que SÃO o
     * responsável (uma nova versão pode ter trocado o responsável de algumas datas). Em avulsa a
     * série é recusada. Com `expectedCount` (o tamanho mostrado na prévia), uma série recalculada
     * de outro tamanho não é cancelada (conflito).
     */
    async cancelOccupation(
      user: User,
      input: { occupationId: string; scope: CancelScope; expectedCount?: number },
    ): Promise<Result<{ cancelled: number }>> {
      const anchor = await loadCancellable(user, input.occupationId);
      if (!anchor.ok) return anchor;
      const at = clock.now().toISOString();
      if (input.scope === "serie") {
        if (anchor.value.source === "manual") return fail("validation", SERIES_ON_MANUAL);
        const from = nowLocal();
        const owner = seriesOwner(user);
        if (input.expectedCount !== undefined) {
          const current = await occupations.seriesDates(anchor.value, from, owner);
          if (current.length !== input.expectedCount) return fail("conflict", SERIES_CHANGED);
        }
        const cancelled = await occupations.cancelSeries(
          anchor.value,
          from,
          owner,
          CANCEL_REASONS.usuario,
          at,
        );
        return ok({ cancelled });
      }
      const cancelled = await occupations.cancelOne(anchor.value.id, CANCEL_REASONS.usuario, at);
      return cancelled ? ok({ cancelled: 1 }) : fail("conflict", ALREADY_CANCELLED);
    },

    /** Datas que o cancelamento de série afetaria (para a confirmação), pela mesma regra. */
    async previewSeries(user: User, occupationId: string): Promise<Result<{ dates: string[] }>> {
      const anchor = await loadCancellable(user, occupationId);
      if (!anchor.ok) return anchor;
      if (anchor.value.source === "manual") return fail("validation", SERIES_ON_MANUAL);
      return ok({
        dates: await occupations.seriesDates(anchor.value, nowLocal(), seriesOwner(user)),
      });
    },

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
      const items = rows.slice(0, limit).map((row) => ({
        ...toItem(row, user, now, people),
        spaceId: row.spaceId,
        spaceName: row.spaceName,
      }));
      return ok({ items, hasMore: rows.length > limit });
    },
  };
}

export type BookingsService = ReturnType<typeof createBookingsService>;
