import { beforeEach, describe, expect, mock, test } from "bun:test";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
  useNavigate,
  useSearch,
} from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { AgendaItem, BookingView, RoomDay, RoomsDay, RoomsWeek } from "#/application/bookings";
import type { BookingSheetProps } from "#/components/agenda/booking-sheet";
import { RoomsView, type SalasSearch } from "#/components/rooms/rooms-view";
import { validateAgendaSearch } from "#/routes/index";
import { requireSelect } from "../dom-values";

const DATE = "2030-11-12";
const NOW = "2030-11-11T09:00";

function room(
  id: string,
  name: string,
  capacity: number | null,
  occupations: AgendaItem[] = [],
): RoomDay {
  const free =
    occupations.length === 0
      ? [{ start: "06:00", end: "23:00" }]
      : [
          { start: "06:00", end: "14:00" },
          { start: "15:00", end: "23:00" },
        ];
  return {
    spaceId: id,
    date: DATE,
    now: NOW,
    hours: { opens: "06:00", closes: "23:00" },
    occupations,
    free,
    blocks: [],
    space: { id, name, capacity },
  };
}

const lesson: AgendaItem = {
  id: "o1",
  date: DATE,
  start: "14:00",
  end: "15:00",
  title: "Cálculo I",
  source: "import",
  status: "ativa",
  canCancel: false,
  mine: false,
  person: null,
};

const DAY: RoomsDay = {
  date: DATE,
  now: NOW,
  rooms: [
    room("a202", "A-202", 40, [lesson]),
    room("b104", "B-104", 25),
    room("lab", "LAB 1", null),
  ],
};

const WEEK_DAYS = ["2030-11-11", DATE, "2030-11-13", "2030-11-14", "2030-11-15"];
const BLOCKS = [
  { label: "Manhã 12", short: "M12", start: "08:00", end: "09:50" },
  { label: "Manhã 34", short: "M34", start: "10:10", end: "12:00" },
];

const WEEK: RoomsWeek = {
  weekStart: "2030-11-11",
  now: NOW,
  days: WEEK_DAYS.map((date) => ({ date, blocks: BLOCKS })),
  rooms: [
    {
      space: { id: "a202", name: "A-202", capacity: 40 },
      occupations: [{ ...lesson, start: "08:00", end: "09:50", title: "Cálculo I — 1A" }],
    },
    { space: { id: "b104", name: "B-104", capacity: 25 }, occupations: [] },
    { space: { id: "lab", name: "LAB 1", capacity: null }, occupations: [] },
  ],
};

const cellsOn = (date: string) => document.querySelectorAll(`[data-cell][data-date='${date}']`);

function setCompact(compact: boolean) {
  window.matchMedia = (query: string) =>
    ({
      matches: compact && query.includes("max-width"),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true,
    }) as unknown as MediaQueryList;
}

type Options = {
  roomsDay?: RoomsDay | null;
  roomsWeek?: RoomsWeek | null;
  error?: string | null;
  canBook?: boolean;
  isVisitor?: boolean;
  isAdmin?: boolean;
  url?: string;
  createFn?: BookingSheetProps["createFn"];
  dayFn?: BookingSheetProps["availability"];
};

const sameDay: NonNullable<BookingSheetProps["availability"]> = async () => ({
  ok: true as const,
  data: DAY,
});

async function setup(options: Options = {}) {
  const loads = { count: 0 };
  const onRetry = mock();
  const root = createRootRoute({
    validateSearch: validateAgendaSearch,
    loader: () => {
      loads.count++;
    },
    component: function Page() {
      const search = useSearch({ strict: false }) as SalasSearch;
      const navigate = useNavigate();
      return (
        <RoomsView
          roomsDay={options.roomsDay === undefined ? DAY : options.roomsDay}
          roomsWeek={options.roomsWeek === undefined ? WEEK : options.roomsWeek}
          error={options.error ?? null}
          selectedDate={DATE}
          search={search}
          canBook={options.canBook ?? true}
          isVisitor={options.isVisitor ?? false}
          isAdmin={options.isAdmin ?? false}
          timeZone="America/Sao_Paulo"
          onSearchChange={(update, replace) =>
            void navigate({ to: ".", search: update as never, replace })
          }
          onRetry={onRetry}
          createFn={options.createFn}
          dayFn={options.dayFn ?? sameDay}
        />
      );
    },
  });
  const router = createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: [options.url ?? "/?visao=colunas"] }),
  });
  await router.load();
  render(<RouterProvider router={router} />);
  await screen.findByTestId("rooms-view");
  return { router, loads, onRetry };
}

const columnOf = (id: string) =>
  document.querySelector(`[data-room-column='${id}'] .relative.min-w-0`) as HTMLElement | null;

/** Altura na coluna (0,9 px/min, folga de 10 px, abre às 06:00). */
const yAt = (time: string) => {
  const [h = 0, m = 0] = time.split(":").map(Number);
  return 10 + (h * 60 + m - 360) * 0.9;
};

function drag(column: HTMLElement, from: string, to: string) {
  const at = (time: string) => ({
    clientY: yAt(time),
    pointerId: 1,
    pointerType: "mouse",
    button: 0,
  });
  fireEvent.pointerDown(column, at(from));
  fireEvent.pointerMove(column, at(to));
  fireEvent.pointerUp(column, at(to));
}

const namesIn = (list: string) => {
  const element = screen.queryByRole("list", { name: list });
  return element === null
    ? []
    : within(element)
        .getAllByRole("listitem")
        .map((item) => within(item).getByRole("heading").textContent);
};
const freeNames = () => namesIn("Salas livres");

beforeEach(() => setCompact(false));

describe("RoomsView", () => {
  test("períodos ficam junto aos filtros, sem uma segunda barra na grade", async () => {
    await setup({ url: "/?visao=geral" });
    const filters = screen.getByRole("region", { name: "Filtros das salas" });
    const periods = within(filters).getByRole("group", { name: "Período" });
    expect(screen.getAllByRole("group", { name: "Período" })).toHaveLength(1);
    fireEvent.click(within(periods).getByRole("button", { name: "Noite" }));
    expect(
      within(periods).getByRole("button", { name: "Noite" }).getAttribute("aria-pressed"),
    ).toBe("true");
  });
  test("a visao Colunas mostra uma coluna por sala", async () => {
    await setup();
    expect(screen.getByRole("button", { name: "Colunas" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(columnOf("a202")).not.toBeNull();
    expect(columnOf("lab")).not.toBeNull();
    expect(screen.getByText("3 de 3 salas")).toBeDefined();
  });

  test("filtros mudam a URL e o resultado", async () => {
    const { router } = await setup();
    fireEvent.click(screen.getByRole("button", { name: "Filtros" }));
    const panel = await screen.findByRole("dialog", { name: "Filtros" });
    fireEvent.click(within(panel).getByRole("button", { name: "Bloco B" }));
    await waitFor(() => expect(router.state.location.search).toMatchObject({ bloco: ["B"] }));
    expect(screen.getByText("1 de 3 salas")).toBeDefined();
    expect(columnOf("a202")).toBeNull();
    expect(columnOf("b104")).not.toBeNull();

    fireEvent.click(within(panel).getByRole("switch", { name: "Só livres" }));
    await waitFor(() =>
      expect(router.state.location.search).toMatchObject({ bloco: ["B"], livres: true }),
    );
    fireEvent.change(within(panel).getByLabelText("Início"), { target: { value: "14:00" } });
    await waitFor(() =>
      expect(router.state.location.search).toMatchObject({ ini: "14:00", fim: "10:30" }),
    );
  });

  test("o chip de andar muda a URL e mostra só as salas do andar", async () => {
    const { router } = await setup();
    fireEvent.click(screen.getByRole("button", { name: "Filtros" }));
    const panel = await screen.findByRole("dialog", { name: "Filtros" });
    fireEvent.click(within(panel).getByRole("button", { name: "Andar 2" }));
    await waitFor(() => expect(router.state.location.search).toMatchObject({ andar: [2] }));
    expect(screen.getByText("1 de 3 salas")).toBeDefined();
    expect(columnOf("a202")).not.toBeNull();
    expect(columnOf("b104")).toBeNull();
    expect(columnOf("lab")).toBeNull();
    expect(screen.getByRole("button", { name: "Filtros · 1" })).toBeDefined();
  });

  test("na visão geral, 'andar' da URL filtra as linhas", async () => {
    await setup({ url: "/?visao=geral&andar=1" });
    expect(document.querySelectorAll("[data-cell][data-room='b104']").length).toBe(10);
    expect(document.querySelectorAll("[data-cell][data-room='a202']").length).toBe(0);
    expect(document.querySelectorAll("[data-cell][data-room='lab']").length).toBe(0);
  });

  test("'Limpar filtros' tira também o andar da URL", async () => {
    const { router } = await setup({ url: "/?andar=1&q=xyz" });
    expect(screen.getByText("Nenhuma sala com esses filtros")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Limpar filtros" }));
    await waitFor(() => expect(router.state.location.search).toEqual({}));
  });

  test("na visão 'Livres', o contador mostra só as salas livres na janela", async () => {
    await setup({ url: "/?visao=livres&ini=14:00&fim=16:00" });
    expect(screen.getByText("2 de 3 salas")).toBeDefined();
    expect(freeNames()).toEqual(["B-104", "LAB 1"]);
    expect(namesIn("Salas ocupadas")).toEqual(["A-202"]);
    expect(screen.getByText("Cálculo I, 14:00–15:00")).toBeDefined();
  });

  test("trocar de visão vai para a URL", async () => {
    const { router } = await setup();
    fireEvent.click(screen.getByRole("button", { name: "Livres" }));
    await waitFor(() => expect(router.state.location.search).toMatchObject({ visao: "livres" }));
    expect(screen.getAllByRole("listitem").length).toBeGreaterThan(0);
  });

  test("o seletor tem 'Sala'; trocar de visualização mantém a data e a sala na URL", async () => {
    const { router } = await setup({ url: `/?visao=livres&data=${DATE}&espaco=b104` });
    const views = screen.getByRole("group", { name: "Visualização" });
    expect(
      within(views)
        .getAllByRole("button")
        .map((button) => [button.textContent, button.getAttribute("aria-pressed")]),
    ).toEqual([
      ["Sala", "false"],
      ["Colunas", "false"],
      ["Livres", "true"],
      ["Visão geral", "false"],
    ]);
    fireEvent.click(within(views).getByRole("button", { name: "Visão geral" }));
    await waitFor(() =>
      expect(router.state.location.search).toEqual({ visao: "geral", data: DATE, espaco: "b104" }),
    );
    fireEvent.click(within(views).getByRole("button", { name: "Sala" }));
    await waitFor(() =>
      expect(router.state.location.search).toEqual({ visao: "sala", data: DATE, espaco: "b104" }),
    );
  });

  test("em 'Livres', o nome da sala abre a agenda dela no mesmo dia", async () => {
    await setup({ url: "/?visao=livres&ini=14:00&fim=16:00" });
    for (const [name, id] of [
      ["LAB 1", "lab"],
      ["A-202", "a202"],
    ] as const) {
      const href = screen.getByRole("link", { name }).getAttribute("href") ?? "";
      const url = new URL(href, "http://x");
      expect(url.pathname).toBe("/");
      expect(Object.fromEntries(url.searchParams)).toEqual({ espaco: id, data: DATE });
    }
  });

  test("trocar o dia vai para a URL", async () => {
    const { router } = await setup();
    fireEvent.click(screen.getByRole("button", { name: "Próximo dia" }));
    await waitFor(() => expect(router.state.location.search).toMatchObject({ data: "2030-11-13" }));
  });

  test("no celular, sem visao na URL, abre em Visao geral", async () => {
    setCompact(true);
    await setup({ url: "/" });
    expect(screen.getByRole("button", { name: /Vis.o geral/ }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(screen.getByTestId("rooms-overview")).toBeDefined();
    expect(columnOf("a202")).toBeNull();
  });

  test("no celular, a visão da URL prevalece", async () => {
    setCompact(true);
    await setup({ url: "/?visao=colunas" });
    expect(columnOf("a202")).not.toBeNull();
  });

  test("clicar no rascunho abre 'Nova reserva' com sala, data e horário", async () => {
    await setup();
    drag(columnOf("b104") as HTMLElement, "14:00", "15:30");
    await new Promise((resolve) => setTimeout(resolve, 0));
    fireEvent.click(screen.getByRole("button", { name: /^Rascunho/ }));
    const dialog = await screen.findByRole("dialog", { name: "Nova reserva" });
    expect(requireSelect(within(dialog).getByLabelText("Sala")).value).toBe("b104");
    expect((within(dialog).getByLabelText("Data") as HTMLInputElement).value).toBe(DATE);
    expect((within(dialog).getByLabelText("Início") as HTMLInputElement).value).toBe("14:00");
    expect((within(dialog).getByLabelText("Fim") as HTMLInputElement).value).toBe("15:30");
  });

  test("Esc descarta o rascunho", async () => {
    await setup();
    drag(columnOf("b104") as HTMLElement, "14:00", "15:30");
    expect(screen.queryAllByRole("button", { name: /^Rascunho/ })).toHaveLength(1);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryAllByRole("button", { name: /^Rascunho/ })).toHaveLength(0);
  });

  test("'Reservar' na lista abre a reserva com a janela; ao reservar, os dados são recarregados", async () => {
    const createFn = mock(async (input: { data: Record<string, string> }) => ({
      ok: true as const,
      data: {
        id: "nova",
        spaceId: input.data.spaceId ?? "",
        date: input.data.date ?? "",
        start: input.data.start ?? "",
        end: input.data.end ?? "",
        title: input.data.purpose ?? "",
      } satisfies BookingView,
    }));
    const { loads } = await setup({ url: "/?visao=livres&ini=14:00&fim=16:00", createFn });
    const before = loads.count;
    fireEvent.click(screen.getByRole("button", { name: "Reservar LAB 1, 14:00–16:00" }));
    const dialog = await screen.findByRole("dialog", { name: "Nova reserva" });
    expect(requireSelect(within(dialog).getByLabelText("Sala")).value).toBe("lab");
    expect((within(dialog).getByLabelText("Início") as HTMLInputElement).value).toBe("14:00");
    expect((within(dialog).getByLabelText("Fim") as HTMLInputElement).value).toBe("16:00");
    fireEvent.change(within(dialog).getByLabelText(/Finalidade/), {
      target: { value: "Reunião" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Reservar" }));
    await screen.findByTestId("booking-success-view");
    expect(createFn).toHaveBeenCalledTimes(1);
    expect(createFn.mock.calls[0]?.[0].data).toMatchObject({
      spaceId: "lab",
      date: DATE,
      start: "14:00",
      end: "16:00",
    });
    await waitFor(() => expect(loads.count).toBeGreaterThan(before));
  });

  test("a reserva busca o dia escolhido e lista livres antes das ocupadas, com o motivo", async () => {
    const dayFn = mock(async (input: { data: { date: string } }) => ({
      ok: true as const,
      data: { ...DAY, date: input.data.date },
    }));
    await setup({ url: "/?visao=livres&ini=14:00&fim=16:00", dayFn });
    fireEvent.click(screen.getByRole("button", { name: "Reservar LAB 1, 14:00–16:00" }));
    const dialog = await screen.findByRole("dialog", { name: "Nova reserva" });
    const select = requireSelect(within(dialog).getByLabelText("Sala"));
    await waitFor(() => expect(select.querySelectorAll("optgroup")).toHaveLength(2));
    expect(dayFn.mock.calls[0]?.[0]).toEqual({ data: { date: DATE } });
    expect(
      Array.from(select.querySelectorAll("optgroup")).map((group) => [
        group.label,
        Array.from(group.querySelectorAll("option")).map((option) => [
          option.textContent,
          option.disabled,
        ]),
      ]),
    ).toEqual([
      [
        "Livres",
        [
          ["B-104", false],
          ["LAB 1", false],
        ],
      ],
      ["Ocupadas", [["A-202 — Cálculo I, 14:00–15:00", true]]],
    ]);
    expect(select.value).toBe("lab");
  });

  test("visitante não desenha rascunho, não vê 'Reservar' e o horário livre pede login", async () => {
    await setup({ canBook: false as const, isVisitor: true });
    const column = columnOf("b104") as HTMLElement;
    drag(column, "14:00", "15:30");
    expect(screen.queryAllByRole("button", { name: /^Rascunho/ })).toHaveLength(0);
    fireEvent.click(within(column).getByRole("button", { name: /^Livre/ }));
    expect(await screen.findByText("Entre para reservar")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Agora não" }));
    await waitFor(() => expect(screen.queryByText("Entre para reservar")).toBeNull());

    fireEvent.click(screen.getByRole("button", { name: "Livres" }));
    await waitFor(() => expect(screen.getAllByRole("listitem").length).toBeGreaterThan(0));
    expect(screen.queryByRole("button", { name: /^Reservar/ })).toBeNull();
  });

  test("janela com fim antes do início avisa e mantém a lista anterior", async () => {
    const { router } = await setup({ url: "/?visao=livres&ini=14:00&fim=16:00" });
    expect(freeNames()).toEqual(["B-104", "LAB 1"]);
    fireEvent.change(screen.getByLabelText("Fim"), { target: { value: "13:00" } });
    await waitFor(() => expect(router.state.location.search).toMatchObject({ fim: "13:00" }));
    expect(screen.getByRole("alert").textContent).toBe("O fim precisa ser depois do início");
    expect(freeNames()).toEqual(["B-104", "LAB 1"]);
  });

  test("sem sala nos filtros, avisa e 'Limpar filtros' tira os filtros da URL", async () => {
    const { router } = await setup({ url: "/?q=xyz&cap=10" });
    expect(screen.getByText("Nenhuma sala com esses filtros")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Limpar filtros" }));
    await waitFor(() => expect(router.state.location.search).toEqual({}));
    expect(screen.getByTestId("rooms-overview")).toBeDefined();
  });

  test("capacidade mínima avisa quantas salas sem capacidade ficaram de fora", async () => {
    await setup({ url: "/?cap=30" });
    expect(screen.getByText("1 de 3 salas")).toBeDefined();
    expect(screen.getByText("1 sala sem capacidade cadastrada ficou de fora")).toBeDefined();
  });

  test("falha do servidor mantém a URL e oferece 'Tentar de novo'", async () => {
    const { onRetry, router } = await setup({
      roomsDay: null,
      error: "Não foi possível carregar as salas",
      url: "/?bloco=A",
    });
    expect(screen.getByRole("alert").textContent).toContain("Não foi possível carregar as salas");
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(router.state.location.search).toEqual({ bloco: ["A"] });
  });

  test("sem salas cadastradas, avisa; admin recebe o atalho para cadastrar", async () => {
    await setup({ roomsDay: { date: DATE, now: NOW, rooms: [] }, isAdmin: true });
    expect(screen.getByText("Nenhuma sala cadastrada")).toBeDefined();
    expect(screen.getByRole("link", { name: "Cadastrar espaços" }).getAttribute("href")).toBe(
      "/admin/espacos",
    );
  });

  test("escolher 'Visão geral' muda a URL", async () => {
    const { router } = await setup();
    fireEvent.click(screen.getByRole("button", { name: "Visão geral" }));
    await waitFor(() => expect(router.state.location.search).toMatchObject({ visao: "geral" }));
    expect(screen.getByRole("button", { name: "Visão geral" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
  });

  test("na visão geral, nova reserva abre o formulário na data selecionada", async () => {
    await setup({ url: "/?visao=geral" });
    fireEvent.click(screen.getByRole("button", { name: "Nova reserva" }));
    const dialog = await screen.findByRole("dialog", { name: "Nova reserva" });
    expect((within(dialog).getByLabelText("Data") as HTMLInputElement).value).toBe(DATE);
  });

  test("na visão geral, nova reserva convida visitantes a entrar", async () => {
    await setup({ url: "/?visao=geral", canBook: false, isVisitor: true });
    fireEvent.click(screen.getByRole("button", { name: "Nova reserva" }));
    expect(await screen.findByText("Entre para reservar")).toBeDefined();
  });

  test("na visão geral, a grade mostra a semana com o título e o contador", async () => {
    await setup({ url: "/?visao=geral" });
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Agenda de salas");
    expect(document.querySelectorAll("[data-cell]").length).toBe(3 * 5 * 2);
    expect(screen.getByText("3 de 3 salas")).toBeDefined();
  });

  test("na visão geral, as setas trocam a semana (±7 dias) na URL", async () => {
    const { router } = await setup({ url: "/?visao=geral" });
    fireEvent.click(screen.getByRole("button", { name: "Próxima semana" }));
    await waitFor(() => expect(router.state.location.search).toMatchObject({ data: "2030-11-19" }));
    fireEvent.click(screen.getByRole("button", { name: "Semana anterior" }));
    await waitFor(() => expect(router.state.location.search).toMatchObject({ data: "2030-11-05" }));
    expect(router.state.location.search).toMatchObject({ visao: "geral" });
  });

  test("semana sem blocos avisa e oferece o atalho para 'Colunas'", async () => {
    const { router } = await setup({
      url: "/?visao=geral",
      roomsWeek: { ...WEEK, days: WEEK_DAYS.map((date) => ({ date, blocks: [] })) },
    });
    expect(screen.getByText("Esta semana não tem blocos de horário")).toBeDefined();
    expect(document.querySelectorAll("[data-cell]").length).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: "Ver em Colunas" }));
    await waitFor(() => expect(router.state.location.search).toMatchObject({ visao: "colunas" }));
  });

  test("na visão geral, filtros sem sala avisam e 'Limpar filtros' tira os filtros", async () => {
    const { router } = await setup({ url: "/?visao=geral&q=xyz" });
    expect(screen.getByText("Nenhuma sala com esses filtros")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Limpar filtros" }));
    await waitFor(() => expect(router.state.location.search).toEqual({ visao: "geral" }));
    expect(document.querySelectorAll("[data-cell]").length).toBe(30);
  });

  test("na visão geral, falha ao carregar a semana mostra o aviso e 'Tentar de novo'", async () => {
    await setup({
      url: "/?visao=geral",
      roomsWeek: null,
      error: "Não foi possível carregar as salas",
    });
    expect(screen.getByRole("alert").textContent).toContain("Não foi possível carregar as salas");
    expect(screen.getByRole("button", { name: "Tentar de novo" })).toBeDefined();
  });

  test("no celular, a visao geral permite percorrer as datas lado a lado", async () => {
    setCompact(true);
    await setup({ url: "/?visao=geral" });
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
    expect(cellsOn(DATE).length).toBe(6);
    expect(cellsOn("2030-11-13").length).toBe(6);
    expect(screen.getByRole("button", { name: "Mais datas" })).toBeDefined();
  });

  test("no celular, tocar num quadradinho ocupado abre o cartão em vez de navegar", async () => {
    setCompact(true);
    const { router } = await setup({ url: "/?visao=geral" });
    const cell = document.querySelector(
      `[data-cell='ocupado'][data-room='a202'][data-date='${DATE}']`,
    ) as HTMLElement;
    expect(cell.hasAttribute("href")).toBe(false);
    fireEvent.click(cell);
    expect(within(screen.getByRole("tooltip")).getByText("Cálculo I")).toBeDefined();
    expect(router.state.location.pathname).toBe("/");
    expect(router.state.location.search).toEqual({ visao: "geral" });
  });

  test("no celular, os quadradinhos têm pelo menos 32 px", async () => {
    setCompact(true);
    await setup({ url: "/?visao=geral" });
    for (const cell of Array.from(cellsOn(DATE)))
      expect((cell as HTMLElement).className.split(" ")).toContain("size-8");
  });

  test("na visão geral, o quadradinho livre seleciona o bloco e 'Reservar' no painel abre a reserva preenchida; a sala é editável e confirmar recarrega a semana", async () => {
    const createFn = mock(async (input: { data: Record<string, string> }) => ({
      ok: true as const,
      data: {
        id: "nova",
        spaceId: input.data.spaceId ?? "",
        date: input.data.date ?? "",
        start: input.data.start ?? "",
        end: input.data.end ?? "",
        title: input.data.purpose ?? "",
      } satisfies BookingView,
    }));
    const { loads } = await setup({ url: "/?visao=geral", createFn });
    const before = loads.count;
    fireEvent.click(
      screen.getByRole("button", { name: "Selecionar B-104, terça 12/11, Manhã 34 10:10–12:00" }),
    );
    expect(screen.queryByRole("dialog", { name: "Nova reserva" }) === null).toBe(true);
    const panel = screen.getByRole("region", { name: "Horário selecionado" });
    fireEvent.click(
      within(panel).getByRole("button", { name: "Reservar B-104, terça 12/11, 10:10–12:00" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Nova reserva" });
    const sala = requireSelect(within(dialog).getByLabelText("Sala"));
    expect(sala.value).toBe("b104");
    expect((within(dialog).getByLabelText("Data") as HTMLInputElement).value).toBe(DATE);
    expect((within(dialog).getByLabelText("Início") as HTMLInputElement).value).toBe("10:10");
    expect((within(dialog).getByLabelText("Fim") as HTMLInputElement).value).toBe("12:00");
    expect(sala.disabled).toBe(false);
    fireEvent.change(sala, { target: { value: "lab" } });
    fireEvent.change(within(dialog).getByLabelText(/Finalidade/), { target: { value: "Reunião" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Reservar" }));
    await screen.findByTestId("booking-success-view");
    expect(createFn.mock.calls[0]?.[0].data).toMatchObject({
      spaceId: "lab",
      date: DATE,
      start: "10:10",
      end: "12:00",
    });
    await waitFor(() => expect(loads.count).toBeGreaterThan(before));
  });

  test("na visão geral, o visitante que escolhe uma sala livre no painel recebe o convite para entrar", async () => {
    await setup({ url: "/?visao=geral", canBook: false as const, isVisitor: true });
    fireEvent.click(
      screen.getByRole("button", { name: "Selecionar B-104, terça 12/11, Manhã 34 10:10–12:00" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Reservar B-104, terça 12/11, 10:10–12:00" }),
    );
    expect(await screen.findByText("Entre para reservar")).toBeDefined();
    expect(screen.queryByRole("dialog", { name: "Nova reserva" }) === null).toBe(true);
  });

  test("sem salas cadastradas, quem não é admin não recebe o atalho", async () => {
    await setup({ roomsDay: { date: DATE, now: NOW, rooms: [] } });
    expect(screen.getByText("Nenhuma sala cadastrada")).toBeDefined();
    expect(screen.queryByRole("link", { name: "Cadastrar espaços" })).toBeNull();
  });
});
