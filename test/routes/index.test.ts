import { afterEach, describe, expect, spyOn, test } from "bun:test";
import type { RoomsDay, RoomsWeek, WeekAgenda } from "#/application/bookings";
import type { User } from "#/domain/user";
import { Route, validateAgendaSearch } from "#/routes/index";
import * as bookingFns from "#/server/booking-fns";
import type { SessionInfo } from "#/server/session";
import * as spacesFns from "#/server/spaces";

const DOCENTE: User = {
  id: "u-1",
  name: "Prof. Carlos",
  email: "carlos@ifsc.edu.br",
  code: "CSILVA",
  roles: ["docente"],
  active: true,
  placeholder: false,
};

const session = (user: User | null): SessionInfo => ({
  user,
  publicRead: true,
  timeZone: "America/Sao_Paulo",
});

const SPACES = [
  { id: "a202", name: "A-202", capacity: 40 },
  { id: "b104", name: "B-104", capacity: 25 },
];

describe("validateAgendaSearch", () => {
  test("mantém a visão e os filtros de salas válidos", () => {
    const filters = {
      bloco: ["A", "Outros"],
      andar: [1, 2],
      cap: 30,
      q: "lab",
      ini: "14:00",
      fim: "16:00",
      livres: true as const,
    };
    for (const visao of ["sala", "colunas", "livres", "geral"] as const) {
      expect(
        validateAgendaSearch({ data: "2026-11-10", espaco: "a202", visao, ...filters }),
      ).toEqual({ data: "2026-11-10", espaco: "a202", visao, ...filters });
    }
  });

  test("visão e filtros inválidos são descartados", () => {
    expect(
      validateAgendaSearch({
        visao: "mapa",
        bloco: ["??"],
        cap: 0,
        q: "   ",
        ini: "9:00",
        fim: "25:00",
        livres: "x",
      }),
    ).toEqual({});
    expect(validateAgendaSearch({ visao: "Sala" })).toEqual({});
  });

  test("'andar' aceita andares de 0 a 9, sem repetição; inválidos são descartados", () => {
    expect(validateAgendaSearch({ andar: [2, "3", 2] })).toEqual({ andar: [2, 3] });
    expect(validateAgendaSearch({ andar: 1 })).toEqual({ andar: [1] });
    expect(validateAgendaSearch({ andar: "0" })).toEqual({ andar: [0] });
    expect(validateAgendaSearch({ andar: [10, -1, 2.5, "x", "", null, true, 4] })).toEqual({
      andar: [4],
    });
    for (const andar of ["abc", 12, [], ["1a"]])
      expect(validateAgendaSearch({ andar })).toEqual({});
  });
});

describe("Route.loaderDeps", () => {
  type DepsArgs = Parameters<NonNullable<typeof Route.options.loaderDeps>>[0];
  const deps = (search: Record<string, unknown>) =>
    Route.options.loaderDeps?.({ search } as unknown as DepsArgs);
  test("entrada sem sala ou visao carrega a semana de todas as salas", () => {
    expect(deps({})?.fonte).toBe("semana");
  });
  const base = { data: "2026-11-10", espaco: "a202" };
  const filters = {
    ini: "14:00",
    fim: "16:00",
    bloco: ["A"],
    cap: 30,
    q: "lab",
    livres: true,
    projetor: true,
    pcs: 8,
  };

  test("sem visão vale 'Sala': a fonte é a agenda da sala", () => {
    expect(deps(base)).toEqual({ data: "2026-11-10", espaco: "a202", fonte: "sala" });
    expect(deps({ ...base, visao: "sala" })).toEqual(deps(base));
  });

  test("trocar 'Colunas' e 'Livres' (e filtros) não muda as deps; a visão geral muda", () => {
    const colunas = deps({ ...base, visao: "colunas" });
    expect(colunas).toEqual({ data: "2026-11-10", espaco: "a202", fonte: "dia" });
    expect(deps({ ...base, visao: "livres", ...filters })).toEqual(colunas);
    expect(deps({ ...base, visao: "geral" })).toEqual({
      data: "2026-11-10",
      espaco: "a202",
      fonte: "semana",
    });
    expect(deps({ ...base, visao: "geral", ...filters })).toEqual(
      deps({ ...base, visao: "geral" }),
    );
    expect(deps({ ...base, visao: "colunas", data: "2026-11-11" })).not.toEqual(colunas);
  });
});

describe("Route.loader", () => {
  type LoaderArgs = { deps: Record<string, unknown>; context: { session: SessionInfo } };
  const loader = Route.options.loader as unknown as (
    args: LoaderArgs,
  ) => Promise<Record<string, unknown>>;

  const spies: Array<{ mockRestore: () => void }> = [];
  afterEach(() => {
    for (const spy of spies.splice(0)) spy.mockRestore();
  });

  /** Registra o argumento de cada server fn; cada uma responde com dados mínimos válidos. */
  function record() {
    const calls = {
      spaces: 0,
      week: [] as unknown[],
      day: [] as unknown[],
      rooms: [] as unknown[],
    };
    spies.push(
      spyOn(spacesFns, "listSpaces").mockImplementation((async () => {
        calls.spaces++;
        return SPACES;
      }) as unknown as typeof spacesFns.listSpaces),
      spyOn(bookingFns, "getWeekAgendaFn").mockImplementation((async (args: {
        data: { spaceId: string; weekStart: string };
      }) => {
        calls.week.push(args);
        const data: WeekAgenda = {
          spaceId: args.data.spaceId,
          weekStart: args.data.weekStart,
          now: "2026-11-03T09:00",
          days: [],
        };
        return { ok: true, data };
      }) as unknown as typeof bookingFns.getWeekAgendaFn),
      spyOn(bookingFns, "getRoomsDayFn").mockImplementation((async (args: {
        data: { date: string };
      }) => {
        calls.day.push(args);
        const data: RoomsDay = { date: args.data.date, now: "2026-11-03T09:00", rooms: [] };
        return { ok: true, data };
      }) as unknown as typeof bookingFns.getRoomsDayFn),
      spyOn(bookingFns, "getRoomsWeekFn").mockImplementation((async (args: {
        data: { weekStart: string };
      }) => {
        calls.rooms.push(args);
        const data: RoomsWeek = {
          weekStart: args.data.weekStart,
          now: "2026-11-03T09:00",
          days: [],
          rooms: [],
        };
        return { ok: true, data };
      }) as unknown as typeof bookingFns.getRoomsWeekFn),
    );
    return calls;
  }

  test("'Sala' pede a semana da sala da URL (segunda da data), sem pedir as salas", async () => {
    const calls = record();
    const data = await loader({
      deps: { data: "2026-11-12", espaco: "b104", fonte: "sala" },
      context: { session: session(DOCENTE) },
    });
    expect(calls.week).toEqual([{ data: { spaceId: "b104", weekStart: "2026-11-09" } }]);
    expect(calls.day).toEqual([]);
    expect(calls.rooms).toEqual([]);
    expect(data).toMatchObject({
      fonte: "sala",
      selectedDate: "2026-11-12",
      selectedSpaceId: "b104",
      weekStart: "2026-11-09",
    });
  });

  test("'Sala' sem sala válida na URL pede a primeira sala", async () => {
    const calls = record();
    await loader({
      deps: { data: "2026-11-12", espaco: "inexistente", fonte: "sala" },
      context: { session: session(null) },
    });
    expect(calls.week).toEqual([{ data: { spaceId: "a202", weekStart: "2026-11-09" } }]);
  });

  test("'Colunas' e 'Livres' pedem o dia da URL numa única chamada", async () => {
    const calls = record();
    const data = await loader({
      deps: { data: "2026-11-12", espaco: "b104", fonte: "dia" },
      context: { session: session(DOCENTE) },
    });
    expect(calls.day).toEqual([{ data: { date: "2026-11-12" } }]);
    expect(calls.week).toEqual([]);
    expect(calls.rooms).toEqual([]);
    expect(calls.spaces).toBe(0);
    expect(data).toMatchObject({ fonte: "dia", selectedDate: "2026-11-12", error: null });
    expect(data.roomsDay).toEqual({ date: "2026-11-12", now: "2026-11-03T09:00", rooms: [] });
  });

  test("sem data, 'Colunas' pede o dia de hoje no fuso configurado", async () => {
    const calls = record();
    const data = await loader({ deps: { fonte: "dia" }, context: { session: session(null) } });
    expect(data.selectedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(calls.day).toEqual([{ data: { date: data.selectedDate } }]);
  });

  test("a visão geral pede a semana de todas as salas (segunda da data) numa única chamada", async () => {
    const calls = record();
    const data = await loader({
      deps: { data: "2026-11-12", fonte: "semana" },
      context: { session: session(null) },
    });
    expect(calls.rooms).toEqual([{ data: { weekStart: "2026-11-09" } }]);
    expect(calls.day).toEqual([]);
    expect(calls.week).toEqual([]);
    expect(calls.spaces).toBe(0);
    expect(data).toMatchObject({ fonte: "semana", selectedDate: "2026-11-12", error: null });
    expect(data.roomsWeek).toMatchObject({ weekStart: "2026-11-09" });
  });

  test("falha ao carregar as salas vira mensagem", async () => {
    spies.push(
      spyOn(bookingFns, "getRoomsWeekFn").mockImplementation((async () => ({
        ok: false,
        message: "Erro interno.",
      })) as unknown as typeof bookingFns.getRoomsWeekFn),
    );
    const data = await loader({
      deps: { data: "2026-11-12", fonte: "semana" },
      context: { session: session(DOCENTE) },
    });
    expect(data.error).toBe("Não foi possível carregar as salas");
    expect(data.roomsWeek).toBeNull();
  });
});
