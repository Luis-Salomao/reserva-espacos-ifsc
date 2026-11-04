import { describe, expect, test } from "bun:test";
import type { RoomsDay, RoomsWeek } from "#/application/bookings";
import type { User } from "#/domain/user";
import { loadSalas, Route, validateSalasSearch } from "#/routes/salas";
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

describe("Route.beforeLoad (redirecionamento)", () => {
  type GuardArgs = Parameters<NonNullable<typeof Route.options.beforeLoad>>[0];
  /** Destino do redirecionamento de `/salas` com a URL dada (já validada pela rota). */
  function target(raw: Record<string, unknown>, user: User | null = DOCENTE, publicRead = true) {
    let thrown: unknown;
    try {
      Route.options.beforeLoad?.({
        search: validateSalasSearch(raw),
        context: { session: session(user, publicRead) },
        location: { pathname: "/salas", searchStr: "" },
      } as unknown as GuardArgs);
    } catch (error) {
      thrown = error;
    }
    return (thrown as { options?: { to?: string; search?: unknown } } | undefined)?.options;
  }

  test("/salas?data=D vai para / com data=D e visao=colunas", () => {
    expect(target({ data: "2026-11-10" })).toMatchObject({
      to: "/",
      search: { data: "2026-11-10", visao: "colunas" },
    });
    expect(target({})?.search).toEqual({ visao: "colunas" });
  });

  test("a visão que já está na URL é mantida", () => {
    for (const visao of ["colunas", "livres", "geral"]) {
      expect(target({ data: "2026-11-10", visao })?.search).toEqual({ data: "2026-11-10", visao });
    }
  });

  test("filtros e janela são mantidos", () => {
    const filters = {
      bloco: ["A", "Outros"],
      andar: [2],
      cap: 30,
      q: "lab",
      ini: "14:00",
      fim: "16:00",
      livres: true,
    };
    const options = target({ data: "2026-11-10", visao: "livres", ...filters });
    expect(options?.to).toBe("/");
    expect(options?.search).toEqual({ data: "2026-11-10", visao: "livres", ...filters });
  });

  test("visitante também é redirecionado; o login fica a cargo de /", () => {
    expect(target({ data: "2026-11-10" }, null, false)).toMatchObject({
      to: "/",
      search: { data: "2026-11-10", visao: "colunas" },
    });
  });
});
