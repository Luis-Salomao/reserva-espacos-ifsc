import { beforeEach, describe, expect, mock, test } from "bun:test";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { AgendaItem, DayAgenda, WeekAgenda } from "#/application/bookings";
import { AgendaView, type AgendaViewProps } from "#/components/agenda/agenda-view";
import type { Space } from "#/domain/space";
import type { User } from "#/domain/user";
import { getTodayDate, getWeekStart, Route, validateAgendaSearch } from "#/routes/index";
import type { SessionInfo } from "#/server/session";

// Fixtures
export const MOCK_DATE_TUESDAY = "2026-11-03";
export const MOCK_WEEK_START = "2026-11-02"; // Segunda-feira

export const MOCK_SPACES: Space[] = [
  { id: "space-adm", name: "ADM 2", capacity: 30 },
  { id: "space-lab", name: "LAB 1", capacity: 20 },
  { id: "space-aud", name: "Auditório", capacity: 100 },
];

export const MOCK_USER_DOCENTE: User = {
  id: "u-docente",
  email: "docente@ifsc.edu.br",
  name: "Prof. Carlos Silva",
  code: "CSILVA",
  roles: ["docente"],
  active: true,
};

export function createMockSession(overrides?: Partial<SessionInfo>): SessionInfo {
  return {
    user: MOCK_USER_DOCENTE,
    publicRead: true,
    timeZone: "America/Sao_Paulo",
    ...overrides,
  };
}

export function createAnonymousSession(publicRead = true): SessionInfo {
  return {
    user: null,
    publicRead,
    timeZone: "America/Sao_Paulo",
  };
}

export function createMockAgendaItem(overrides?: Partial<AgendaItem>): AgendaItem {
  return {
    id: "item-1",
    date: MOCK_DATE_TUESDAY,
    start: "08:00",
    end: "09:40",
    title: "Cálculo I",
    source: "import",
    status: "ativa",
    canCancel: false,
    mine: false,
    person: null,
    ...overrides,
  };
}

export function createMockDayAgenda(overrides?: Partial<DayAgenda>): DayAgenda {
  const date = overrides?.date ?? MOCK_DATE_TUESDAY;
  return {
    spaceId: "space-adm",
    date,
    now: `${date}T10:00`,
    hours: { opens: "06:00", closes: "23:00" },
    occupations: [
      createMockAgendaItem({
        id: "occ-import",
        date,
        start: "08:00",
        end: "09:40",
        title: "Cálculo I",
        source: "import",
      }),
      createMockAgendaItem({
        id: "occ-manual",
        date,
        start: "10:10",
        end: "12:00",
        title: "Reunião de Colegiado",
        source: "manual",
        canCancel: true,
        mine: true,
      }),
    ],
    free: [
      { start: "06:00", end: "08:00" },
      { start: "09:40", end: "10:10" },
      { start: "12:00", end: "23:00" },
    ],
    blocks: [
      { label: "Manhã 1", short: "M1", start: "07:30", end: "08:15" },
      { label: "Manhã 2", short: "M2", start: "08:15", end: "09:00" },
      { label: "Manhã 3", short: "M3", start: "09:40", end: "10:25" },
    ],
    ...overrides,
  };
}

export function createMockWeekAgenda(overrides?: Partial<WeekAgenda>): WeekAgenda {
  const weekStart = overrides?.weekStart ?? MOCK_WEEK_START;
  const days: DayAgenda[] = [
    createMockDayAgenda({
      date: "2026-11-02",
      occupations: [],
      free: [{ start: "06:00", end: "23:00" }],
    }),
    createMockDayAgenda({ date: "2026-11-03" }),
    createMockDayAgenda({
      date: "2026-11-04",
      occupations: [],
      free: [{ start: "06:00", end: "23:00" }],
    }),
    createMockDayAgenda({
      date: "2026-11-05",
      occupations: [],
      free: [{ start: "06:00", end: "23:00" }],
    }),
    createMockDayAgenda({
      date: "2026-11-06",
      occupations: [],
      free: [{ start: "06:00", end: "23:00" }],
    }),
    createMockDayAgenda({
      date: "2026-11-07",
      occupations: [],
      free: [{ start: "06:00", end: "23:00" }],
    }),
    createMockDayAgenda({
      date: "2026-11-08",
      occupations: [],
      free: [{ start: "06:00", end: "23:00" }],
    }),
  ];

  return {
    spaceId: "space-adm",
    weekStart,
    now: `${weekStart}T10:00`,
    days,
    ...overrides,
  };
}

// Provedor de roteador para componentes que usam Link
async function renderAgenda(props: AgendaViewProps) {
  const root = createRootRoute({
    component: () => <AgendaView {...props} />,
  });
  const login = createRoute({
    getParentRoute: () => root,
    path: "/entrar",
    component: () => null,
  });
  const router = createRouter({
    routeTree: root.addChildren([login]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(<RouterProvider router={router} />);
  await screen.findByTestId("agenda-view-root");
  return router;
}

function setViewportWidth(width: number) {
  Object.defineProperty(window, "innerWidth", {
    writable: true,
    configurable: true,
    value: width,
  });
  window.matchMedia = (query: string) => {
    const minMatch = query.match(/\(min-width:\s*(\d+)px\)/);
    const min = minMatch ? Number.parseInt(minMatch[1], 10) : 0;
    const maxMatch = query.match(/\(max-width:\s*(\d+)px\)/);
    const max = maxMatch ? Number.parseInt(maxMatch[1], 10) : Infinity;
    const matches = width >= min && width <= max;
    return {
      matches,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true,
    } as unknown as MediaQueryList;
  };
  window.dispatchEvent(new Event("resize"));
}

describe("AgendaView — Suíte 1: Visualização Semanal Desktop", () => {
  beforeEach(() => {
    setViewportWidth(1280);
  });

  test("renderiza cabeçalhos dos dias da semana (segunda a sexta) e sala ativa", async () => {
    const week = createMockWeekAgenda();
    await renderAgenda({
      spaces: MOCK_SPACES,
      selectedSpaceId: "space-adm",
      selectedDate: MOCK_DATE_TUESDAY,
      weekAgenda: week,
      session: createMockSession(),
      onSelectDate: () => {},
      onSelectSpace: () => {},
    });

    expect(screen.getAllByText("ADM 2").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Seg/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Ter/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Qua/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Qui/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Sex/i).length).toBeGreaterThan(0);
  });

  test("renderiza eixo horário vertical das 06:00 às 23:00", async () => {
    const week = createMockWeekAgenda();
    await renderAgenda({
      spaces: MOCK_SPACES,
      selectedSpaceId: "space-adm",
      selectedDate: MOCK_DATE_TUESDAY,
      weekAgenda: week,
      session: createMockSession(),
      onSelectDate: () => {},
      onSelectSpace: () => {},
    });

    expect(screen.getAllByText("06:00").length).toBeGreaterThan(0);
    expect(screen.getAllByText("12:00").length).toBeGreaterThan(0);
    expect(screen.getAllByText("23:00").length).toBeGreaterThan(0);
  });

  test("renderiza ocupações com título, horário e tags de estado", async () => {
    const week = createMockWeekAgenda();
    await renderAgenda({
      spaces: MOCK_SPACES,
      selectedSpaceId: "space-adm",
      selectedDate: MOCK_DATE_TUESDAY,
      weekAgenda: week,
      session: createMockSession(),
      onSelectDate: () => {},
      onSelectSpace: () => {},
    });

    expect(screen.getAllByText("Cálculo I").length).toBeGreaterThan(0);
    expect(screen.getAllByText("08:00–09:40").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Reunião de Colegiado").length).toBeGreaterThan(0);
    expect(screen.getAllByText("10:10–12:00").length).toBeGreaterThan(0);
  });

  test("omite sábado e domingo por padrão se não houver ocupações no fim de semana", async () => {
    const week = createMockWeekAgenda();
    await renderAgenda({
      spaces: MOCK_SPACES,
      selectedSpaceId: "space-adm",
      selectedDate: MOCK_DATE_TUESDAY,
      weekAgenda: week,
      session: createMockSession(),
      onSelectDate: () => {},
      onSelectSpace: () => {},
    });

    const weekGrid = screen.getByTestId("week-grid");
    expect(within(weekGrid).queryByText(/Sáb/i)).toBeNull();
    expect(within(weekGrid).queryByText(/Dom/i)).toBeNull();
  });

  test("exibe coluna de sábado quando existe ocupação no sábado", async () => {
    const week = createMockWeekAgenda();
    week.days[5] = createMockDayAgenda({
      date: "2026-11-07",
      occupations: [
        createMockAgendaItem({
          id: "occ-sabado",
          date: "2026-11-07",
          start: "08:00",
          end: "12:00",
          title: "Aula Especial Sábado",
        }),
      ],
      free: [{ start: "12:00", end: "23:00" }],
    });

    await renderAgenda({
      spaces: MOCK_SPACES,
      selectedSpaceId: "space-adm",
      selectedDate: MOCK_DATE_TUESDAY,
      weekAgenda: week,
      session: createMockSession(),
      onSelectDate: () => {},
      onSelectSpace: () => {},
    });

    const weekGrid = screen.getByTestId("week-grid");
    expect(within(weekGrid).getByText(/^Sáb$/i)).toBeTruthy();
    expect(within(weekGrid).getByText("Aula Especial Sábado")).toBeTruthy();
  });

  test("renderiza legenda com amostras textuais (Aula importada, Reserva, Conflito, Livre)", async () => {
    const week = createMockWeekAgenda();
    await renderAgenda({
      spaces: MOCK_SPACES,
      selectedSpaceId: "space-adm",
      selectedDate: MOCK_DATE_TUESDAY,
      weekAgenda: week,
      session: createMockSession(),
      onSelectDate: () => {},
      onSelectSpace: () => {},
    });

    const legend = screen.getByLabelText("Legenda de estados da agenda");
    expect(within(legend).getByText("Aula importada")).toBeTruthy();
    expect(within(legend).getByText("Reserva")).toBeTruthy();
    expect(within(legend).getByText("Conflito")).toBeTruthy();
    expect(within(legend).getByText("Livre")).toBeTruthy();
  });
});

describe("AgendaView — Suíte 2: Linha do Tempo Diária Mobile (RNF-01, 360 px)", () => {
  beforeEach(() => {
    setViewportWidth(360);
  });

  test("em 360 px renderiza timeline de um único dia sem grade semanal de colunas", async () => {
    const week = createMockWeekAgenda();
    const { container } = render(
      <AgendaView
        spaces={MOCK_SPACES}
        selectedSpaceId="space-adm"
        selectedDate={MOCK_DATE_TUESDAY}
        weekAgenda={week}
        session={createMockSession()}
        onSelectDate={() => {}}
        onSelectSpace={() => {}}
      />,
    );

    expect(screen.getAllByText("Cálculo I").length).toBeGreaterThan(0);
    const aside = container.querySelector("aside.side");
    expect(aside).toBeTruthy();
    expect(aside?.className).toContain("hidden");
  });

  test("renderiza a faixa semanal móvel (.wk) com os dias de segunda a sexta", async () => {
    const week = createMockWeekAgenda();
    await renderAgenda({
      spaces: MOCK_SPACES,
      selectedSpaceId: "space-adm",
      selectedDate: MOCK_DATE_TUESDAY,
      weekAgenda: week,
      session: createMockSession(),
      onSelectDate: () => {},
      onSelectSpace: () => {},
    });

    const strip = screen.getByRole("region", { name: "Dias da semana" });
    const terBtn = within(strip).getByRole("button", {
      name: /\b3 de novembro/i,
    });
    expect(terBtn.getAttribute("aria-pressed")).toBe("true");
  });

  test("clicar em outro dia na faixa semanal móvel emite callback onSelectDate", async () => {
    const onSelectDate = mock();
    const week = createMockWeekAgenda();
    await renderAgenda({
      spaces: MOCK_SPACES,
      selectedSpaceId: "space-adm",
      selectedDate: MOCK_DATE_TUESDAY,
      weekAgenda: week,
      session: createMockSession(),
      onSelectDate: onSelectDate,
      onSelectSpace: () => {},
    });

    const strip = screen.getByRole("region", { name: "Dias da semana" });
    const quaBtn = within(strip).getByRole("button", {
      name: /\b4 de novembro/i,
    });
    fireEvent.click(quaBtn);

    expect(onSelectDate).toHaveBeenCalledWith("2026-11-04");
  });

  test("navegação de semana (< e >) avança e retrocede 7 dias", async () => {
    const onSelectDate = mock();
    const week = createMockWeekAgenda();
    await renderAgenda({
      spaces: MOCK_SPACES,
      selectedSpaceId: "space-adm",
      selectedDate: MOCK_DATE_TUESDAY,
      weekAgenda: week,
      session: createMockSession(),
      onSelectDate: onSelectDate,
      onSelectSpace: () => {},
    });

    const strip = screen.getByRole("region", { name: "Dias da semana" });
    const prevWeekBtn = within(strip).getByRole("button", {
      name: "Semana anterior",
    });
    fireEvent.click(prevWeekBtn);
    expect(onSelectDate).toHaveBeenCalledWith("2026-10-27");

    const nextWeekBtn = within(strip).getByRole("button", {
      name: "Próxima semana",
    });
    fireEvent.click(nextWeekBtn);
    expect(onSelectDate).toHaveBeenCalledWith("2026-11-10");
  });

  test("renderiza o botão flutuante FAB 'Reservar' no mobile", async () => {
    const onNewBooking = mock();
    const week = createMockWeekAgenda();
    await renderAgenda({
      spaces: MOCK_SPACES,
      selectedSpaceId: "space-adm",
      selectedDate: MOCK_DATE_TUESDAY,
      weekAgenda: week,
      session: createMockSession(),
      onSelectDate: () => {},
      onSelectSpace: () => {},
      onNewBooking: onNewBooking,
    });

    const fab = screen.getByRole("button", { name: /^Reservar$/i });
    expect(fab).toBeTruthy();
    fireEvent.click(fab);
    expect(onNewBooking).toHaveBeenCalled();
  });
});

describe("AgendaView — Suíte 3: Mini Calendário Desktop", () => {
  beforeEach(() => {
    setViewportWidth(1280);
  });

  test("exibe o cabeçalho do mês e ano (ex: Novembro 2026)", async () => {
    const week = createMockWeekAgenda();
    await renderAgenda({
      spaces: MOCK_SPACES,
      selectedSpaceId: "space-adm",
      selectedDate: MOCK_DATE_TUESDAY,
      weekAgenda: week,
      session: createMockSession(),
      onSelectDate: () => {},
      onSelectSpace: () => {},
    });

    expect(screen.getByText(/Novembro 2026/i)).toBeTruthy();
  });

  test("destaca o dia selecionado com aria-pressed='true'", async () => {
    const week = createMockWeekAgenda();
    await renderAgenda({
      spaces: MOCK_SPACES,
      selectedSpaceId: "space-adm",
      selectedDate: MOCK_DATE_TUESDAY,
      weekAgenda: week,
      session: createMockSession(),
      onSelectDate: () => {},
      onSelectSpace: () => {},
    });

    const miniCal = screen.getByLabelText("Mini calendário");
    const day3 = within(miniCal).getByRole("button", {
      name: /\b3 de novembro/i,
    });
    expect(day3.getAttribute("aria-pressed")).toBe("true");
  });

  test("clicar em um dia no mini calendário chama onSelectDate com a data correspondente", async () => {
    const onSelectDate = mock();
    const week = createMockWeekAgenda();
    await renderAgenda({
      spaces: MOCK_SPACES,
      selectedSpaceId: "space-adm",
      selectedDate: MOCK_DATE_TUESDAY,
      weekAgenda: week,
      session: createMockSession(),
      onSelectDate: onSelectDate,
      onSelectSpace: () => {},
    });

    const miniCal = screen.getByLabelText("Mini calendário");
    const day10 = within(miniCal).getByRole("button", {
      name: /\b10 de novembro/i,
    });
    fireEvent.click(day10);

    expect(onSelectDate).toHaveBeenCalledWith("2026-11-10");
  });
});

describe("AgendaView — Suíte 4: Seletor de Espaços (Desktop e Mobile)", () => {
  test("no desktop abre salas com destaque na sala ativa", async () => {
    setViewportWidth(1280);
    const week = createMockWeekAgenda();
    await renderAgenda({
      spaces: MOCK_SPACES,
      selectedSpaceId: "space-adm",
      selectedDate: MOCK_DATE_TUESDAY,
      weekAgenda: week,
      session: createMockSession(),
      onSelectDate: () => {},
      onSelectSpace: () => {},
    });

    const aside = screen.getByLabelText("Filtros da agenda");
    fireEvent.click(within(aside).getByRole("button", { name: /Escolher sala/i }));
    const btnAdm = screen.getByRole("button", { name: /ADM 2/i, pressed: true });
    const btnLab = screen.getByRole("button", { name: /LAB 1/i, pressed: false });

    expect(btnAdm.getAttribute("aria-pressed")).toBe("true");
    expect(btnLab.getAttribute("aria-pressed")).toBe("false");
  });

  test("no mobile abre seletor pesquisavel de salas", async () => {
    setViewportWidth(360);
    const week = createMockWeekAgenda();
    await renderAgenda({
      spaces: MOCK_SPACES,
      selectedSpaceId: "space-adm",
      selectedDate: MOCK_DATE_TUESDAY,
      weekAgenda: week,
      session: createMockSession(),
      onSelectDate: () => {},
      onSelectSpace: () => {},
    });

    fireEvent.click(
      screen.getAllByRole("button", { name: /Escolher sala/i }).at(-1) as HTMLElement,
    );
    expect(screen.getByRole("textbox", { name: /Buscar sala/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /LAB 1/i })).toBeTruthy();
  });

  test("clicar em outro espaço chama onSelectSpace mantendo a data intacta", async () => {
    const onSelectSpace = mock();
    const week = createMockWeekAgenda();
    await renderAgenda({
      spaces: MOCK_SPACES,
      selectedSpaceId: "space-adm",
      selectedDate: MOCK_DATE_TUESDAY,
      weekAgenda: week,
      session: createMockSession(),
      onSelectDate: () => {},
      onSelectSpace: onSelectSpace,
    });

    const aside = screen.getByLabelText("Filtros da agenda");
    fireEvent.click(within(aside).getByRole("button", { name: /Escolher sala/i }));
    const btnLab = screen.getByRole("button", { name: /LAB 1/i });
    fireEvent.click(btnLab);

    expect(onSelectSpace).toHaveBeenCalledWith("space-lab");
  });
});

describe("AgendaView — Suíte 5: Intervalos Livres Clicáveis", () => {
  test("exibe blocos livres com rótulo 'Livre' e horário correspondente", async () => {
    setViewportWidth(1280);
    const week = createMockWeekAgenda();
    await renderAgenda({
      spaces: MOCK_SPACES,
      selectedSpaceId: "space-adm",
      selectedDate: MOCK_DATE_TUESDAY,
      weekAgenda: week,
      session: createMockSession(),
      onSelectDate: () => {},
      onSelectSpace: () => {},
    });

    expect(screen.getAllByText(/Livre/).length).toBeGreaterThan(0);
    const gapBtn = screen.getAllByRole("button", {
      name: /Livre.*09:40.*10:10/i,
    })[0];
    expect(gapBtn).toBeTruthy();
  });

  test("usuário autenticado ao clicar em slot livre emite callback onSelectSlot com detalhes", async () => {
    setViewportWidth(1280);
    const onSelectSlot = mock();
    const week = createMockWeekAgenda();
    await renderAgenda({
      spaces: MOCK_SPACES,
      selectedSpaceId: "space-adm",
      selectedDate: MOCK_DATE_TUESDAY,
      weekAgenda: week,
      session: createMockSession(),
      onSelectDate: () => {},
      onSelectSpace: () => {},
      onSelectSlot: onSelectSlot,
    });

    const gapBtn = screen.getAllByRole("button", {
      name: /Livre.*09:40.*10:10/i,
    })[0];
    fireEvent.click(gapBtn);

    expect(onSelectSlot).toHaveBeenCalledWith({
      spaceId: "space-adm",
      date: MOCK_DATE_TUESDAY,
      start: "09:40",
      end: "10:10",
    });
  });
});

describe("AgendaView — Suíte 6: Modo Leitura Pública (PUBLIC_READ=true)", () => {
  test("visitante não autenticado vê banner informativo com botão de entrar", async () => {
    const week = createMockWeekAgenda();
    await renderAgenda({
      spaces: MOCK_SPACES,
      selectedSpaceId: "space-adm",
      selectedDate: MOCK_DATE_TUESDAY,
      weekAgenda: week,
      session: createAnonymousSession(true),
      onSelectDate: () => {},
      onSelectSpace: () => {},
    });

    expect(screen.getByText(/Você está vendo como/i)).toBeTruthy();
    expect(screen.getByText(/visitante/i)).toBeTruthy();
    const loginLink = screen.getByRole("link", { name: /Entrar/i });
    expect(loginLink.getAttribute("href")).toBe("/entrar");
  });

  test("visitante NÃO vê nomes de pessoas nem e-mails nas ocupações", async () => {
    const week = createMockWeekAgenda();
    await renderAgenda({
      spaces: MOCK_SPACES,
      selectedSpaceId: "space-adm",
      selectedDate: MOCK_DATE_TUESDAY,
      weekAgenda: week,
      session: createAnonymousSession(true),
      onSelectDate: () => {},
      onSelectSpace: () => {},
    });

    expect(screen.getAllByText("Cálculo I").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Reunião de Colegiado").length).toBeGreaterThan(0);

    expect(screen.queryByText("Prof. Carlos Silva")).toBeNull();
    expect(screen.queryByText("docente@ifsc.edu.br")).toBeNull();
  });

  test("visitante ao clicar em slot livre abre diálogo gate 'Entre para reservar' em vez de reservar", async () => {
    const onSelectSlot = mock();
    const week = createMockWeekAgenda();
    await renderAgenda({
      spaces: MOCK_SPACES,
      selectedSpaceId: "space-adm",
      selectedDate: MOCK_DATE_TUESDAY,
      weekAgenda: week,
      session: createAnonymousSession(true),
      onSelectDate: () => {},
      onSelectSpace: () => {},
      onSelectSlot: onSelectSlot,
    });

    const gapBtn = screen.getAllByRole("button", {
      name: /Livre.*09:40.*10:10/i,
    })[0];
    fireEvent.click(gapBtn);

    expect(onSelectSlot).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(screen.getByText(/Entre para reservar/i)).toBeTruthy();
  });
});

describe("AgendaView — Suíte 7: Sincronização de URL e Funções Auxiliares de Rota", () => {
  test("validateAgendaSearch valida parâmetros, filtra inválidos e extra", () => {
    expect(validateAgendaSearch({})).toEqual({});
    expect(validateAgendaSearch({ data: "2026-11-04", espaco: "space-adm" })).toEqual({
      data: "2026-11-04",
      espaco: "space-adm",
    });
    expect(validateAgendaSearch({ data: "2026-02-30" })).toEqual({});
    expect(validateAgendaSearch({ data: "invalid", espaco: "   " })).toEqual({});
    expect(validateAgendaSearch({ data: "2026-11-04", extra: "test" })).toEqual({
      data: "2026-11-04",
    });
  });

  test("getWeekStart normaliza qualquer dia para a segunda-feira correspondente", () => {
    // 2026-11-02 é segunda
    expect(getWeekStart("2026-11-02")).toBe("2026-11-02");
    // 2026-11-04 é quarta
    expect(getWeekStart("2026-11-04")).toBe("2026-11-02");
    // 2026-11-08 é domingo
    expect(getWeekStart("2026-11-08")).toBe("2026-11-02");
  });

  test("getTodayDate extrai a data no fuso horário configurado", () => {
    const dt = new Date("2026-11-03T12:00:00Z");
    expect(getTodayDate("America/Sao_Paulo", dt)).toBe("2026-11-03");
  });

  test("Route.beforeLoad: quando PUBLIC_READ=false e visitante tenta acessar, lança redirect para /entrar", () => {
    const context = {
      session: createAnonymousSession(false),
    };
    const location = { pathname: "/", searchStr: "?data=2026-11-04&espaco=space-lab" };
    expect(() => {
      // @ts-expect-error accessing route beforeLoad handler directly for testing
      Route.options.beforeLoad({ context, location });
    }).toThrow();
  });

  test("Route.beforeLoad: quando PUBLIC_READ=true e visitante acessa, permite navegação", () => {
    const context = {
      session: createAnonymousSession(true),
    };
    const location = { pathname: "/", searchStr: "?data=2026-11-04&espaco=space-lab" };
    expect(() => {
      // @ts-expect-error accessing route beforeLoad handler directly for testing
      Route.options.beforeLoad({ context, location });
    }).not.toThrow();
  });
});
