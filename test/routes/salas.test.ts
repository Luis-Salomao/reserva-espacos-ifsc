import { describe, expect, spyOn, test } from "bun:test";
import type { RoomsDay, RoomsWeek } from "#/application/bookings";
import { weekOf } from "#/domain/overview";
import type { User } from "#/domain/user";
import { loadSalas, Route, validateSalasSearch } from "#/routes/salas";
import * as bookingFns from "#/server/booking-fns";
import type { SessionInfo } from "#/server/session";

const DOCENTE: User = {
  id: "u-1",
  name: "Prof. Carlos",
  email: "carlos@ifsc.edu.br",
  code: "CSILVA",
  roles: ["docente"],
  active: true,
  placeholder: false,
};

const session = (user: User | null, publicRead = true): SessionInfo => ({
  user,
  publicRead,
  timeZone: "America/Sao_Paulo",
});

/** Terça, 03/11/2026, 09:00 em Brasília. */
const NOW = new Date("2026-11-03T12:00:00Z");

const day = (date: string): RoomsDay => ({ date, now: "2026-11-03T09:00", rooms: [] });

describe("validateSalasSearch", () => {
  test("mantém todos os parâmetros válidos", () => {
    expect(
      validateSalasSearch({
        data: "2026-11-10",
        visao: "colunas",
        bloco: ["A", "Outros"],
        cap: 30,
        q: "lab",
        ini: "14:00",
        fim: "16:00",
        livres: true,
      }),
    ).toEqual({
      data: "2026-11-10",
      visao: "colunas",
      bloco: ["A", "Outros"],
      cap: 30,
      q: "lab",
      ini: "14:00",
      fim: "16:00",
      livres: true,
    });
    expect(validateSalasSearch({ visao: "livres" })).toEqual({ visao: "livres" });
    expect(validateSalasSearch({ visao: "geral", data: "2026-11-10" })).toEqual({
      visao: "geral",
      data: "2026-11-10",
    });
    expect(validateSalasSearch({})).toEqual({});
  });

  test("data inválida é descartada (a página usa hoje)", () => {
    for (const data of ["2026-02-30", "10/11/2026", "", 20261110, null]) {
      expect(validateSalasSearch({ data })).toEqual({});
    }
  });

  test("capacidade fora de 1–999 ou não inteira é ignorada", () => {
    for (const cap of [0, -1, 1000, 2.5, "abc", "", null, true]) {
      expect(validateSalasSearch({ cap })).toEqual({});
    }
    expect(validateSalasSearch({ cap: 1 })).toEqual({ cap: 1 });
    expect(validateSalasSearch({ cap: 999 })).toEqual({ cap: 999 });
    expect(validateSalasSearch({ cap: "25" })).toEqual({ cap: 25 });
  });

  test("bloco em formato inexistente é ignorado; letra única vira lista, sem repetição", () => {
    expect(validateSalasSearch({ bloco: ["A", "Z9", "", "Bloco C", 3, "Outros"] })).toEqual({
      bloco: ["A", "Outros"],
    });
    expect(validateSalasSearch({ bloco: "b" })).toEqual({ bloco: ["B"] });
    expect(validateSalasSearch({ bloco: ["A", "a"] })).toEqual({ bloco: ["A"] });
    expect(validateSalasSearch({ bloco: ["??"] })).toEqual({});
    expect(validateSalasSearch({ bloco: 7 })).toEqual({});
  });

  test("visão, busca, janela e 'só livres' inválidos são descartados", () => {
    expect(
      validateSalasSearch({ visao: "mapa", q: "   ", ini: "9:00", fim: "25:00", livres: "x" }),
    ).toEqual({});
    expect(validateSalasSearch({ q: "  Auditório  " })).toEqual({ q: "Auditório" });
    expect(validateSalasSearch({ q: 202 })).toEqual({ q: "202" });
    expect(validateSalasSearch({ livres: "true" })).toEqual({ livres: true });
    expect(validateSalasSearch({ livres: false })).toEqual({});
  });
});

describe("loadSalas", () => {
  test("sem data, carrega hoje no fuso configurado numa única chamada", async () => {
    const calls: string[] = [];
    const data = await loadSalas(
      undefined,
      session(DOCENTE),
      async (date) => {
        calls.push(date);
        return { ok: true, data: day(date) };
      },
      NOW,
    );
    expect(calls).toEqual(["2026-11-03"]);
    expect(data.selectedDate).toBe("2026-11-03");
    expect(data.roomsDay).toEqual(day("2026-11-03"));
    expect(data.error).toBeNull();
    expect(data.canBook).toBe(true);
    expect(data.isVisitor).toBe(false);
  });

  test("data da URL é usada; visitante não reserva", async () => {
    const data = await loadSalas(
      "2026-11-10",
      session(null),
      async (date) => ({ ok: true, data: day(date) }),
      NOW,
    );
    expect(data.selectedDate).toBe("2026-11-10");
    expect(data.isVisitor).toBe(true);
    expect(data.canBook).toBe(false);
    expect(data.isAdmin).toBe(false);
  });

  test("falha do servidor vira mensagem, sem dados", async () => {
    const failed = await loadSalas(
      "2026-11-10",
      session(DOCENTE),
      async () => ({ ok: false, message: "Erro interno." }),
      NOW,
    );
    expect(failed.roomsDay).toBeNull();
    expect(failed.error).toBe("Não foi possível carregar as salas");
    const thrown = await loadSalas(
      "2026-11-10",
      session(DOCENTE),
      async () => {
        throw new Error("rede");
      },
      NOW,
    );
    expect(thrown.roomsDay).toBeNull();
    expect(thrown.error).toBe("Não foi possível carregar as salas");
  });

  test("admin é identificado (atalho para cadastrar espaços)", async () => {
    const data = await loadSalas(
      undefined,
      session({ ...DOCENTE, roles: ["admin"] }),
      async (date) => ({ ok: true, data: day(date) }),
      NOW,
    );
    expect(data.isAdmin).toBe(true);
    expect(data.canBook).toBe(true);
  });
});

describe("loadSalas na visão geral", () => {
  const week = (weekStart: string): RoomsWeek => ({
    weekStart,
    now: "2026-11-03T09:00",
    days: [],
    rooms: [],
  });

  function recorder() {
    const days: string[] = [];
    const weeks: string[] = [];
    return {
      days,
      weeks,
      fetchDay: async (date: string) => {
        days.push(date);
        return { ok: true as const, data: day(date) };
      },
      fetchWeek: async (weekStart: string) => {
        weeks.push(weekStart);
        return { ok: true as const, data: week(weekStart) };
      },
    };
  }

  test("pede a semana da data da URL (a segunda-feira) numa única chamada, sem pedir o dia", async () => {
    const r = recorder();
    const data = await loadSalas("2026-11-12", session(DOCENTE), r.fetchDay, NOW, {
      geral: true,
      fetchWeek: r.fetchWeek,
    });
    expect(r.weeks).toEqual(["2026-11-09"]);
    expect(r.days).toEqual([]);
    expect(data.selectedDate).toBe("2026-11-12");
    expect(data.roomsWeek).toEqual(week("2026-11-09"));
    expect(data.roomsDay).toBeNull();
    expect(data.error).toBeNull();
  });

  test("sem data, pede a semana de hoje no fuso configurado; domingo volta à segunda anterior", async () => {
    const r = recorder();
    const today = await loadSalas(undefined, session(DOCENTE), r.fetchDay, NOW, {
      geral: true,
      fetchWeek: r.fetchWeek,
    });
    expect(today.selectedDate).toBe("2026-11-03");
    await loadSalas("2026-11-08", session(null), r.fetchDay, NOW, {
      geral: true,
      fetchWeek: r.fetchWeek,
    });
    await loadSalas("2026-11-09", session(null), r.fetchDay, NOW, {
      geral: true,
      fetchWeek: r.fetchWeek,
    });
    expect(r.weeks).toEqual(["2026-11-02", "2026-11-02", "2026-11-09"]);
    expect(r.days).toEqual([]);
  });

  test("fora da visão geral pede só o dia", async () => {
    const r = recorder();
    const data = await loadSalas("2026-11-12", session(DOCENTE), r.fetchDay, NOW, {
      geral: false,
      fetchWeek: r.fetchWeek,
    });
    expect(r.days).toEqual(["2026-11-12"]);
    expect(r.weeks).toEqual([]);
    expect(data.roomsDay).toEqual(day("2026-11-12"));
    expect(data.roomsWeek).toBeNull();
  });

  test("falha do servidor na semana vira mensagem, sem dados", async () => {
    const r = recorder();
    const failed = await loadSalas("2026-11-12", session(DOCENTE), r.fetchDay, NOW, {
      geral: true,
      fetchWeek: async () => ({ ok: false, message: "Erro interno." }),
    });
    expect(failed.roomsWeek).toBeNull();
    expect(failed.error).toBe("Não foi possível carregar as salas");
    const thrown = await loadSalas("2026-11-12", session(DOCENTE), r.fetchDay, NOW, {
      geral: true,
      fetchWeek: async () => {
        throw new Error("rede");
      },
    });
    expect(thrown.roomsWeek).toBeNull();
    expect(thrown.error).toBe("Não foi possível carregar as salas");
  });
});

describe("Route.loaderDeps", () => {
  type DepsArgs = Parameters<NonNullable<typeof Route.options.loaderDeps>>[0];
  const deps = (search: Record<string, unknown>) =>
    Route.options.loaderDeps?.({ search } as unknown as DepsArgs);
  const base = { data: "2026-11-10" };
  const filters = { ini: "14:00", fim: "16:00", bloco: ["A"], cap: 30, q: "lab", livres: true };

  test("janela, filtros e troca entre Colunas e Livres não disparam nova carga", () => {
    const changed = { ...base, visao: "livres", ...filters };
    expect(deps(changed)).toEqual({ data: "2026-11-10", geral: false });
    expect(deps(changed)).toEqual(deps(base));
    expect(deps({ ...base, visao: "colunas" })).toEqual(deps({ ...base, visao: "livres" }));
    expect(deps({ data: "2026-11-11" })).not.toEqual(deps(base));
  });

  test("entrar ou sair da visão geral dispara nova carga; filtros dentro dela não", () => {
    const geral = { ...base, visao: "geral" };
    expect(deps(geral)).toEqual({ data: "2026-11-10", geral: true });
    expect(deps(geral)).not.toEqual(deps({ ...base, visao: "colunas" }));
    expect(deps(geral)).not.toEqual(deps({ ...base, visao: "livres" }));
    expect(deps({ ...geral, ...filters })).toEqual(deps(geral));
    expect(deps({ ...geral, data: "2026-11-17" })).not.toEqual(deps(geral));
  });
});

describe("Route.loader", () => {
  test("carrega o dia que vem das deps, não o de hoje", async () => {
    const loader = Route.options.loader as unknown as (
      args: unknown,
    ) => ReturnType<typeof loadSalas>;
    const data = await loader({
      deps: { data: "2030-01-15" },
      context: { session: session(DOCENTE) },
    });
    expect(data.selectedDate).toBe("2030-01-15");
  });

  test("pede ao servidor o dia da URL ou, sem data, o de hoje", async () => {
    const loader = Route.options.loader as unknown as (
      args: unknown,
    ) => ReturnType<typeof loadSalas>;
    const calls: unknown[] = [];
    const spy = spyOn(bookingFns, "getRoomsDayFn").mockImplementation((async (args: {
      data: { date: string };
    }) => {
      calls.push(args);
      return { ok: true, data: day(args.data.date) };
    }) as unknown as typeof bookingFns.getRoomsDayFn);
    try {
      const withDate = await loader({
        deps: { data: "2030-01-15" },
        context: { session: session(DOCENTE) },
      });
      const today = await loader({ deps: {}, context: { session: session(DOCENTE) } });
      expect(calls[0]).toEqual({ data: { date: "2030-01-15" } });
      expect(calls[1]).toEqual({ data: { date: today.selectedDate } });
      expect(today.selectedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(withDate.error).toBeNull();
      expect(today.error).toBeNull();
    } finally {
      spy.mockRestore();
    }
  });

  test("na visão geral pede ao servidor só a semana (segunda da data da URL ou de hoje)", async () => {
    const loader = Route.options.loader as unknown as (
      args: unknown,
    ) => ReturnType<typeof loadSalas>;
    const weekCalls: unknown[] = [];
    const dayCalls: unknown[] = [];
    const weekSpy = spyOn(bookingFns, "getRoomsWeekFn").mockImplementation((async (args: {
      data: { weekStart: string };
    }) => {
      weekCalls.push(args);
      return {
        ok: true,
        data: { weekStart: args.data.weekStart, now: "2026-11-03T09:00", days: [], rooms: [] },
      };
    }) as unknown as typeof bookingFns.getRoomsWeekFn);
    const daySpy = spyOn(bookingFns, "getRoomsDayFn").mockImplementation((async (args: unknown) => {
      dayCalls.push(args);
      return { ok: false, message: "não deveria" };
    }) as unknown as typeof bookingFns.getRoomsDayFn);
    try {
      const withDate = await loader({
        deps: { data: "2030-01-17", geral: true },
        context: { session: session(DOCENTE) },
      });
      const today = await loader({ deps: { geral: true }, context: { session: session(null) } });
      expect(weekCalls).toEqual([
        { data: { weekStart: "2030-01-14" } },
        { data: { weekStart: weekOf(today.selectedDate)[0] } },
      ]);
      expect(dayCalls).toEqual([]);
      expect(withDate.selectedDate).toBe("2030-01-17");
      expect(withDate.roomsWeek?.weekStart).toBe("2030-01-14");
      expect(withDate.error).toBeNull();
      expect(today.error).toBeNull();
    } finally {
      weekSpy.mockRestore();
      daySpy.mockRestore();
    }
  });
});

describe("Route.beforeLoad", () => {
  type GuardArgs = Parameters<NonNullable<typeof Route.options.beforeLoad>>[0];
  const beforeLoad = (context: { session: SessionInfo }) =>
    Route.options.beforeLoad?.({
      context,
      location: { pathname: "/salas", searchStr: "?data=2026-11-10" },
    } as unknown as GuardArgs);

  test("PUBLIC_READ=false: visitante é mandado ao login com retorno", () => {
    let thrown: unknown;
    try {
      beforeLoad({ session: session(null, false) });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toMatchObject({
      options: { to: "/entrar", search: { voltar: "/salas?data=2026-11-10" } },
    });
  });

  test("PUBLIC_READ=true ou logado: entra", () => {
    expect(() => beforeLoad({ session: session(null, true) })).not.toThrow();
    expect(() => beforeLoad({ session: session(DOCENTE, false) })).not.toThrow();
  });
});
