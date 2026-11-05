import { describe, expect, mock, test } from "bun:test";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { AgendaItem, RoomsWeek } from "#/application/bookings";
import { RoomsOverview } from "#/components/rooms/rooms-overview";
import { RESERVA_TONE, SUBJECT_PALETTE, subjectTone } from "#/domain/overview";

const MON = "2026-11-09";
const TUE = "2026-11-10";
const WED = "2026-11-11";
const THU = "2026-11-12";
const FRI = "2026-11-13";

const BLOCKS = [
  { label: "Manhã 12", short: "M12", start: "08:00", end: "09:50" },
  { label: "Manhã 34", short: "M34", start: "10:10", end: "12:00" },
];

function item(over: Partial<AgendaItem> & Pick<AgendaItem, "id" | "date" | "start" | "end">) {
  return {
    title: "Cálculo I — 1A",
    source: "import",
    status: "ativa",
    canCancel: false,
    mine: false,
    person: null,
    ...over,
  } satisfies AgendaItem;
}

const WEEK: RoomsWeek = {
  weekStart: MON,
  now: "2026-11-03T09:00",
  days: [MON, TUE, WED, THU, FRI].map((date) => ({ date, blocks: BLOCKS })),
  rooms: [
    {
      space: { id: "a202", name: "A-202", capacity: 40 },
      occupations: [
        item({ id: "c1", date: MON, start: "08:00", end: "09:50" }),
        item({
          id: "f1",
          date: TUE,
          start: "08:30",
          end: "09:50",
          title: "Física — 2B",
          person: { name: "Ana Souza", code: "1234", placeholder: false },
        }),
        item({ id: "c2", date: WED, start: "08:00", end: "08:50" }),
        item({ id: "q1", date: WED, start: "09:00", end: "09:50", title: "Química — 3C" }),
        item({
          id: "r1",
          date: THU,
          start: "10:10",
          end: "12:00",
          title: "Reunião",
          source: "manual",
        }),
      ],
    },
    { space: { id: "b104", name: "B-104", capacity: 25 }, occupations: [] },
    {
      space: { id: "lab", name: "LAB 1", capacity: null },
      occupations: [item({ id: "x1", date: FRI, start: "12:10", end: "13:00", title: "Oficina" })],
    },
  ],
};

type RenderOptions = {
  loadWeek?: (date: string) => Promise<RoomsWeek>;
  isVisitor?: boolean;
  canReserve?: boolean;
  now?: string;
  compact?: boolean;
};

async function renderOverview(options: RenderOptions = {}) {
  const onBook = mock();
  const week = { ...WEEK, now: options.now ?? WEEK.now };
  const root = createRootRoute({
    component: () => (
      <RoomsOverview
        week={week}
        {...(options.loadWeek ? { loadWeek: options.loadWeek } : {})}
        rooms={week.rooms}
        isVisitor={options.isVisitor ?? false}
        compact={options.compact ?? false}
        selectedDate={MON}
        canReserve={options.canReserve ?? true}
        onBook={onBook}
      />
    ),
  });
  const router = createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: ["/salas?visao=geral"] }),
  });
  render(<RouterProvider router={router} />);
  await screen.findByTestId("rooms-overview");
  return { onBook, router };
}

const cellAt = (room: string, date: string, block: string) =>
  document.querySelector(
    `[data-cell][data-room='${room}'][data-date='${date}'][data-block='${block}']`,
  ) as HTMLElement;

const selectionPanel = () => screen.getByRole("region", { name: "Horário selecionado" });

const panelTitle = () => within(selectionPanel()).getByRole("heading", { level: 2 }).textContent;

/** Quadradinhos destacados pela seleção, na ordem da grade: [sala, dia, bloco]. */
const selectedCells = () =>
  Array.from(document.querySelectorAll<HTMLElement>("[data-cell][data-selected]")).map((cell) => [
    cell.dataset.room,
    cell.dataset.date,
    cell.dataset.block,
  ]);

const listOf = (name: string) => screen.getByRole("list", { name });
const maybeList = (name: string) => screen.queryByRole("list", { name });

const namesIn = (name: string) =>
  within(listOf(name))
    .getAllByRole("listitem")
    .flatMap((item) => {
      const heading = within(item).queryByRole("heading");
      return heading === null ? [] : [heading.textContent];
    });

/** Arrasto com o mouse de um quadradinho a outro. */
function sweep(from: HTMLElement, to: HTMLElement) {
  fireEvent.pointerDown(from, { pointerType: "mouse", button: 0 });
  fireEvent.pointerEnter(to, { pointerType: "mouse" });
  fireEvent.pointerUp(to, { pointerType: "mouse" });
}

const stripesOf = (cell: HTMLElement) =>
  Array.from(cell.querySelectorAll<HTMLElement>("[data-stripe]")).map((stripe) => ({
    light: stripe.style.getPropertyValue("--tone-light"),
    dark: stripe.style.getPropertyValue("--tone-dark"),
  }));

const toneOf = (subject: string) => SUBJECT_PALETTE[subjectTone(subject)];

/** Por faixa: esmaecida (atributo e opacidade reduzida) ou em cor cheia. */
const dimmedOf = (cell: HTMLElement) =>
  Array.from(cell.querySelectorAll<HTMLElement>("[data-stripe]")).map((stripe) => {
    const dimmed = stripe.hasAttribute("data-dimmed");
    expect(stripe.className.split(" ").includes("opacity-20")).toBe(dimmed);
    return dimmed;
  });

describe("RoomsOverview", () => {
  test("recolher um bloco oculta só suas salas e expandir restaura a grade", async () => {
    await renderOverview();
    fireEvent.click(screen.getByRole("button", { name: "Recolher Bloco A" }));
    expect(
      screen.getByRole("button", { name: "Expandir Bloco A" }).getAttribute("aria-expanded"),
    ).toBe("false");
    expect(document.querySelectorAll("[data-cell][data-room='a202']").length).toBe(0);
    expect(document.querySelectorAll("[data-cell][data-room='b104']").length).toBe(10);
    fireEvent.click(screen.getByRole("button", { name: "Expandir Bloco A" }));
    expect(document.querySelectorAll("[data-cell][data-room='a202']").length).toBe(10);
  });
  test("filtra os periodos e volta a mostrar todos os horarios", async () => {
    await renderOverview();
    const periods = screen.getByRole("group", { name: /Per.odo/ });
    fireEvent.click(within(periods).getByRole("button", { name: "Noite" }));
    expect(document.querySelectorAll("[data-cell]").length).toBe(0);
    fireEvent.click(within(periods).getByRole("button", { name: /Manh/ }));
    expect(document.querySelectorAll("[data-cell]").length).toBe(30);
    expect(screen.getAllByText("08:00").length).toBeGreaterThan(0);
    expect(cellAt("a202", WED, "M12").textContent).toContain("2");
  });

  test("rolar a direita acrescenta a semana e permite reservar nela", async () => {
    const next: RoomsWeek = {
      ...WEEK,
      weekStart: "2026-11-16",
      days: WEEK.days.map((day, index) => ({ ...day, date: `2026-11-${16 + index}` })),
      rooms: WEEK.rooms.map((room) => ({ ...room, occupations: [] })),
    };
    const loadWeek = mock(async () => next);
    const { onBook } = await renderOverview({ loadWeek });
    fireEvent.scroll(screen.getByTestId("rooms-overview"));
    await waitFor(() => expect(document.querySelectorAll("[data-cell]").length).toBe(60));
    expect(loadWeek).toHaveBeenCalledWith("2026-11-16");
    expect(cellAt("a202", MON, "M12")).toBeDefined();
    fireEvent.click(cellAt("b104", "2026-11-16", "M12"));
    fireEvent.click(within(selectionPanel()).getByRole("button", { name: /Reservar B-104/ }));
    expect(onBook).toHaveBeenCalledWith({
      spaceId: "b104",
      date: "2026-11-16",
      start: "08:00",
      end: "09:50",
    });
  });

  test("3 salas × 5 dias × 2 blocos geram 30 quadradinhos", async () => {
    await renderOverview();
    expect(document.querySelectorAll("[data-cell]").length).toBe(30);
    for (const room of ["a202", "b104", "lab"])
      expect(document.querySelectorAll(`[data-cell][data-room='${room}']`).length).toBe(10);
  });

  test("bloco ocupado tem a cor da matéria; a mesma matéria tem a mesma cor em outro dia", async () => {
    await renderOverview();
    const monday = cellAt("a202", MON, "M12");
    expect(monday.getAttribute("data-cell")).toBe("ocupado");
    expect(stripesOf(monday)).toEqual([toneOf("Cálculo I")]);
    expect(stripesOf(cellAt("a202", WED, "M12"))[0]).toEqual(toneOf("Cálculo I"));
    expect(stripesOf(cellAt("a202", TUE, "M12"))).toEqual([toneOf("Física")]);
  });

  test("bloco livre fica vazio, só com contorno e sem cor", async () => {
    await renderOverview();
    const free = cellAt("b104", MON, "M12");
    expect(free.getAttribute("data-cell")).toBe("livre");
    expect(stripesOf(free)).toEqual([]);
    expect(free.style.getPropertyValue("--tone-light")).toBe("");
    expect(free.className.split(" ")).toContain("border");
  });

  test("duas ocupações no mesmo bloco viram duas faixas, uma por ocupação", async () => {
    await renderOverview();
    expect(stripesOf(cellAt("a202", WED, "M12"))).toEqual([toneOf("Cálculo I"), toneOf("Química")]);
  });

  test("reserva avulsa usa a cor neutra de 'Reserva'", async () => {
    await renderOverview();
    expect(stripesOf(cellAt("a202", THU, "M34"))).toEqual([RESERVA_TONE]);
  });

  test("ocupação que não cobre o bloco inteiro marca o quadradinho como parcial", async () => {
    await renderOverview();
    expect(cellAt("a202", TUE, "M12").hasAttribute("data-partial")).toBe(true);
    expect(cellAt("a202", MON, "M12").hasAttribute("data-partial")).toBe(false);
  });

  test("clicar num quadradinho ocupado leva à agenda da sala no dia", async () => {
    await renderOverview();
    const cell = cellAt("a202", TUE, "M12");
    expect(cell.tagName).toBe("A");
    expect(cell.getAttribute("href")).toBe(`/?espaco=a202&data=${TUE}`);
  });

  test("a legenda lista as matérias da semana em ordem alfabética e 'Reserva'", async () => {
    await renderOverview();
    const legend = screen.getByRole("group", { name: "Legenda" });
    expect(
      within(legend)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Cálculo I", "Física", "Oficina", "Química", "Reserva"]);
  });

  test("clicar numa matéria a destaca e esmaece os quadradinhos das outras", async () => {
    await renderOverview();
    const legend = screen.getByRole("group", { name: "Legenda" });
    const calculo = within(legend).getByRole("button", { name: "Cálculo I" });
    expect(calculo.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(calculo);
    expect(calculo.getAttribute("aria-pressed")).toBe("true");
    expect(dimmedOf(cellAt("a202", MON, "M12"))).toEqual([false]);
    expect(dimmedOf(cellAt("a202", WED, "M12"))).toEqual([false, true]);
    expect(dimmedOf(cellAt("a202", TUE, "M12"))).toEqual([true]);
    expect(dimmedOf(cellAt("a202", THU, "M34"))).toEqual([true]);
  });

  test("clicar de novo na matéria destacada remove o destaque", async () => {
    await renderOverview();
    const legend = screen.getByRole("group", { name: "Legenda" });
    fireEvent.click(within(legend).getByRole("button", { name: "Física" }));
    expect(dimmedOf(cellAt("a202", MON, "M12"))).toEqual([true]);
    const fisica = within(legend).getByRole("button", { name: "Física" });
    fireEvent.click(fisica);
    expect(fisica.getAttribute("aria-pressed")).toBe("false");
    expect(dimmedOf(cellAt("a202", MON, "M12"))).toEqual([false]);
    expect(dimmedOf(cellAt("a202", TUE, "M12"))).toEqual([false]);
  });

  test("'Reserva' na legenda destaca só as reservas avulsas", async () => {
    await renderOverview();
    const legend = screen.getByRole("group", { name: "Legenda" });
    fireEvent.click(within(legend).getByRole("button", { name: "Reserva" }));
    expect(dimmedOf(cellAt("a202", THU, "M34"))).toEqual([false]);
    expect(dimmedOf(cellAt("a202", MON, "M12"))).toEqual([true]);
  });

  test("foco abre o cartão com matéria, turma, sala, dia e horário real", async () => {
    await renderOverview();
    const cell = cellAt("a202", TUE, "M12");
    fireEvent.focus(cell);
    const card = screen.getByRole("tooltip");
    expect(cell.getAttribute("aria-describedby")).toBe(card.id);
    expect(within(card).getByText("Física")).toBeDefined();
    expect(within(card).getByText("Turma 2B")).toBeDefined();
    expect(within(card).getByText("A-202 · terça 10/11 · 08:30–09:50")).toBeDefined();
    fireEvent.blur(cell);
    expect(screen.queryByRole("tooltip") === null).toBe(true);
  });

  test("passar o mouse abre o cartão e sair fecha", async () => {
    await renderOverview();
    const cell = cellAt("a202", MON, "M12");
    fireEvent.mouseEnter(cell);
    expect(within(screen.getByRole("tooltip")).getByText("Cálculo I")).toBeDefined();
    fireEvent.mouseLeave(cell);
    expect(screen.queryByRole("tooltip") === null).toBe(true);
  });

  test("logado vê o nome e o avatar do responsável no cartão", async () => {
    await renderOverview();
    fireEvent.focus(cellAt("a202", TUE, "M12"));
    const card = screen.getByRole("tooltip");
    expect(within(card).getByText("Ana Souza")).toBeDefined();
    expect(card.querySelector("[data-slot='avatar']") === null).toBe(false);
  });

  test("visitante não vê nome, iniciais nem avatar no cartão", async () => {
    await renderOverview({ isVisitor: true });
    fireEvent.focus(cellAt("a202", TUE, "M12"));
    const card = screen.getByRole("tooltip");
    expect(within(card).getByText("Física")).toBeDefined();
    expect(card.textContent?.includes("Ana Souza")).toBe(false);
    expect(card.textContent?.includes("AS")).toBe(false);
    expect(card.querySelector("[data-slot='avatar']") === null).toBe(true);
  });

  test("o quadradinho cresce com transição de até 150 ms, sem escala com movimento reduzido", async () => {
    await renderOverview();
    const cell = cellAt("a202", MON, "M12");
    const classes = () => cell.className.split(" ");
    const duration = classes()
      .map((name) => /^duration-(\d+)$/.exec(name)?.[1])
      .find((value) => value !== undefined);
    expect(Number(duration)).toBeGreaterThan(0);
    expect(Number(duration)).toBeLessThanOrEqual(150);
    expect(classes()).toContain("motion-reduce:transition-none");
    expect(classes()).not.toContain("scale-160");
    fireEvent.focus(cell);
    expect(classes()).toEqual(expect.arrayContaining(["scale-160", "motion-reduce:scale-100"]));
  });

  test("clicar num quadradinho livre seleciona o bloco, sugere a sala da linha e não abre a reserva", async () => {
    const { onBook } = await renderOverview();
    const free = cellAt("b104", TUE, "M34");
    expect(free.tagName).toBe("BUTTON");
    expect(free.getAttribute("aria-label")).toBe(
      "Selecionar B-104, terça 10/11, Manhã 34 10:10–12:00",
    );
    fireEvent.click(free);
    expect(onBook).toHaveBeenCalledTimes(0);
    expect(panelTitle()).toBe("terça 10/11 · 10:10–12:00");
    expect(selectedCells()).toEqual([
      ["a202", TUE, "M34"],
      ["b104", TUE, "M34"],
      ["lab", TUE, "M34"],
    ]);
    const first = within(listOf("Salas livres no horário")).getAllByRole("listitem")[0];
    expect(within(first as HTMLElement).getByRole("heading").textContent).toBe("B-104");
    expect(within(first as HTMLElement).getByText("Sugerida")).toBeDefined();
  });

  test("arrastar de um bloco a outro no mesmo dia seleciona do início do primeiro ao fim do último, em todas as salas", async () => {
    const { onBook } = await renderOverview();
    sweep(cellAt("b104", TUE, "M12"), cellAt("a202", TUE, "M34"));
    expect(onBook).toHaveBeenCalledTimes(0);
    expect(panelTitle()).toBe("terça 10/11 · 08:00–12:00");
    expect(selectedCells()).toEqual([
      ["a202", TUE, "M12"],
      ["a202", TUE, "M34"],
      ["b104", TUE, "M12"],
      ["b104", TUE, "M34"],
      ["lab", TUE, "M12"],
      ["lab", TUE, "M34"],
    ]);
  });

  test("arrastar para trás e começar num ocupado também seleciona o trecho", async () => {
    await renderOverview();
    sweep(cellAt("a202", TUE, "M34"), cellAt("lab", TUE, "M12"));
    expect(panelTitle()).toBe("terça 10/11 · 08:00–12:00");
  });

  test("o arrasto não passa para outro dia: o trecho fica no dia onde começou", async () => {
    await renderOverview();
    fireEvent.pointerDown(cellAt("b104", TUE, "M12"), { pointerType: "mouse", button: 0 });
    fireEvent.pointerEnter(cellAt("b104", TUE, "M34"), { pointerType: "mouse" });
    fireEvent.pointerEnter(cellAt("b104", WED, "M12"), { pointerType: "mouse" });
    const tuesday = [
      ["a202", TUE, "M12"],
      ["a202", TUE, "M34"],
      ["b104", TUE, "M12"],
      ["b104", TUE, "M34"],
      ["lab", TUE, "M12"],
      ["lab", TUE, "M34"],
    ];
    expect(selectedCells()).toEqual(tuesday);
    fireEvent.pointerUp(cellAt("b104", WED, "M12"), { pointerType: "mouse" });
    expect(panelTitle()).toBe("terça 10/11 · 08:00–12:00");
    expect(selectedCells()).toEqual(tuesday);
  });

  test("arrastar de um bloco direto para outro dia não seleciona trecho", async () => {
    await renderOverview();
    fireEvent.pointerDown(cellAt("b104", TUE, "M12"), { pointerType: "mouse", button: 0 });
    fireEvent.pointerEnter(cellAt("b104", WED, "M34"), { pointerType: "mouse" });
    fireEvent.pointerUp(cellAt("b104", WED, "M34"), { pointerType: "mouse" });
    expect(screen.queryByRole("region", { name: "Horário selecionado" }) === null).toBe(true);
    expect(selectedCells()).toEqual([]);
  });

  test("o painel lista as livres antes das ocupadas, com o motivo da ocupação", async () => {
    await renderOverview();
    fireEvent.click(cellAt("b104", TUE, "M12"));
    expect(namesIn("Salas livres no horário")).toEqual(["B-104", "LAB 1"]);
    expect(namesIn("Salas ocupadas no horário")).toEqual(["A-202"]);
    const free = listOf("Salas livres no horário");
    const title = within(selectionPanel()).getByRole("heading", { name: "Ocupadas", level: 3 });
    const busy = listOf("Salas ocupadas no horário");
    expect(free.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(title.compareDocumentPosition(busy) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(busy).getByText("Física — 2B, 08:30–09:50")).toBeDefined();
  });

  test("visitante não vê nome nem iniciais de pessoas no painel", async () => {
    await renderOverview({ isVisitor: true });
    fireEvent.click(cellAt("b104", TUE, "M12"));
    const panel = selectionPanel();
    expect(within(panel).getByText("Física — 2B, 08:30–09:50")).toBeDefined();
    expect(panel.textContent?.includes("Ana Souza")).toBe(false);
    expect(panel.querySelector("[data-slot='avatar']") === null).toBe(true);
  });

  test("o painel filtra por bloco e por andar", async () => {
    await renderOverview();
    fireEvent.click(cellAt("b104", TUE, "M34"));
    const panel = selectionPanel();
    fireEvent.click(within(panel).getByRole("button", { name: "Bloco B" }));
    expect(namesIn("Salas livres no horário")).toEqual(["B-104"]);
    expect(maybeList("Salas ocupadas no horário") === null).toBe(true);
    fireEvent.click(within(panel).getByRole("button", { name: "Bloco B" }));
    fireEvent.click(within(panel).getByRole("button", { name: "Andar 2" }));
    expect(namesIn("Salas livres no horário")).toEqual(["A-202"]);
    expect(maybeList("Salas ocupadas no horário") === null).toBe(true);
  });

  test("início e fim ajustáveis no painel mudam o trecho, o destaque e as livres", async () => {
    await renderOverview();
    fireEvent.click(cellAt("b104", TUE, "M34"));
    const panel = selectionPanel();
    fireEvent.change(within(panel).getByLabelText("Início"), { target: { value: "09:00" } });
    expect(panelTitle()).toBe("terça 10/11 · 09:00–12:00");
    expect(selectedCells().filter(([room]) => room === "a202")).toEqual([
      ["a202", TUE, "M12"],
      ["a202", TUE, "M34"],
    ]);
    expect(namesIn("Salas ocupadas no horário")).toEqual(["A-202"]);
    fireEvent.change(within(panel).getByLabelText("Fim"), { target: { value: "08:30" } });
    expect(within(panel).getByRole("alert").textContent).toBe("O fim precisa ser depois do início");
    expect(maybeList("Salas livres no horário") === null).toBe(true);
  });

  test("escolher uma sala livre no painel pede a reserva com sala, dia e horário do trecho", async () => {
    const { onBook } = await renderOverview();
    sweep(cellAt("b104", TUE, "M12"), cellAt("b104", TUE, "M34"));
    fireEvent.click(
      screen.getByRole("button", { name: "Reservar LAB 1, terça 10/11, 08:00–12:00" }),
    );
    expect(onBook).toHaveBeenCalledTimes(1);
    expect(onBook).toHaveBeenCalledWith({
      spaceId: "lab",
      date: TUE,
      start: "08:00",
      end: "12:00",
    });
  });

  test("sala ocupada no painel não tem botão de reservar", async () => {
    await renderOverview();
    fireEvent.click(cellAt("b104", TUE, "M12"));
    const busy = listOf("Salas ocupadas no horário");
    expect(within(busy).queryByRole("button", { name: /^Reservar/ }) === null).toBe(true);
  });

  test("trecho que já terminou não oferece reserva no painel", async () => {
    await renderOverview({ now: `${TUE}T10:00` });
    fireEvent.click(cellAt("b104", TUE, "M12"));
    const panel = selectionPanel();
    expect(within(panel).getByText("Esse horário já terminou")).toBeDefined();
    expect(within(panel).queryByRole("button", { name: /^Reservar/ }) === null).toBe(true);
    fireEvent.click(cellAt("b104", TUE, "M34"));
    expect(
      screen.getByRole("button", { name: "Reservar B-104, terça 10/11, 10:10–12:00" }),
    ).toBeDefined();
  });

  test("trecho em andamento mostra todas as salas ocupadas com 'Horário já passou', sem reserva", async () => {
    await renderOverview({ now: `${TUE}T09:00` });
    fireEvent.click(cellAt("b104", TUE, "M12"));
    const panel = selectionPanel();
    expect(within(panel).queryByText("Esse horário já terminou") === null).toBe(true);
    expect(maybeList("Salas livres no horário") === null).toBe(true);
    expect(within(panel).getByText("Nenhuma sala livre nesse horário")).toBeDefined();
    expect(namesIn("Salas ocupadas no horário")).toEqual(["A-202", "B-104", "LAB 1"]);
    for (const room of within(listOf("Salas ocupadas no horário")).getAllByRole("listitem"))
      expect(within(room).getByText("Horário já passou")).toBeDefined();
    expect(within(panel).queryByRole("button", { name: /^Reservar/ }) === null).toBe(true);
  });

  test("quem não pode reservar nem é visitante vê as livres sem botão de reservar", async () => {
    await renderOverview({ canReserve: false });
    fireEvent.click(cellAt("b104", TUE, "M34"));
    expect(namesIn("Salas livres no horário")).toEqual(["B-104", "A-202", "LAB 1"]);
    expect(within(selectionPanel()).queryByRole("button", { name: /^Reservar/ }) === null).toBe(
      true,
    );
  });

  test("Espaço num quadradinho ocupado seleciona o bloco sem sair da página", async () => {
    const { router } = await renderOverview();
    fireEvent.keyDown(cellAt("a202", TUE, "M12"), { key: " " });
    expect(panelTitle()).toBe("terça 10/11 · 08:00–09:50");
    expect(router.state.location.pathname).toBe("/salas");
  });

  test("fechar o painel tira a seleção e volta a legenda", async () => {
    await renderOverview();
    fireEvent.click(cellAt("b104", TUE, "M12"));
    expect(screen.queryByRole("group", { name: "Legenda" }) === null).toBe(true);
    fireEvent.click(within(selectionPanel()).getByRole("button", { name: "Fechar seleção" }));
    expect(screen.queryByRole("region", { name: "Horário selecionado" }) === null).toBe(true);
    expect(selectedCells()).toEqual([]);
    expect(screen.getByRole("group", { name: "Legenda" })).toBeDefined();
  });

  test("Escape fecha o painel de seleção e volta a legenda", async () => {
    await renderOverview();
    fireEvent.click(cellAt("b104", TUE, "M12"));
    expect(screen.queryByRole("group", { name: "Legenda" }) === null).toBe(true);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("region", { name: "Horário selecionado" }) === null).toBe(true);
    expect(selectedCells()).toEqual([]);
    expect(screen.getByRole("group", { name: "Legenda" })).toBeDefined();
  });

  test("Escape fecha o cartão de detalhe do quadradinho focado", async () => {
    await renderOverview();
    const cell = cellAt("a202", TUE, "M12");
    fireEvent.focus(cell);
    expect(screen.getByRole("tooltip")).toBeDefined();
    fireEvent.keyDown(cell, { key: "Escape" });
    expect(screen.queryByRole("tooltip") === null).toBe(true);
    expect(cell.hasAttribute("aria-describedby")).toBe(false);
    expect(cell.className.split(" ")).not.toContain("scale-160");
  });

  test("no celular, o toque seleciona um bloco por vez, sem arrasto", async () => {
    await renderOverview({ compact: true });
    const start = cellAt("b104", MON, "M12");
    fireEvent.pointerDown(start, { pointerType: "touch", button: 0 });
    fireEvent.pointerEnter(cellAt("b104", MON, "M34"), { pointerType: "touch" });
    fireEvent.pointerUp(cellAt("b104", MON, "M34"), { pointerType: "touch" });
    expect(screen.queryByRole("region", { name: "Horário selecionado" }) === null).toBe(true);
    fireEvent.click(start);
    expect(panelTitle()).toBe("segunda 09/11 · 08:00–09:50");
    fireEvent.change(within(selectionPanel()).getByLabelText("Fim"), {
      target: { value: "12:00" },
    });
    expect(panelTitle()).toBe("segunda 09/11 · 08:00–12:00");
  });

  test("ocupação fora de todos os blocos aparece no aviso da linha da sala", async () => {
    await renderOverview();
    const warning = document.querySelector("[data-outside='lab']") as HTMLElement | null;
    expect(warning === null).toBe(false);
    expect(warning?.getAttribute("aria-label")).toBe(
      "1 ocupação fora dos blocos: Oficina, sexta 13/11, 12:10–13:00",
    );
    expect(document.querySelector("[data-outside='a202']") === null).toBe(true);
  });
});
