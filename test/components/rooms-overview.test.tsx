import { describe, expect, test } from "bun:test";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { fireEvent, render, screen, within } from "@testing-library/react";
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

async function renderOverview(options: { isVisitor?: boolean } = {}) {
  const root = createRootRoute({
    component: () => (
      <RoomsOverview
        week={WEEK}
        rooms={WEEK.rooms}
        isVisitor={options.isVisitor ?? false}
        compact={false}
        selectedDate={MON}
      />
    ),
  });
  const router = createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: ["/salas?visao=geral"] }),
  });
  render(<RouterProvider router={router} />);
  await screen.findByTestId("rooms-overview");
}

const cellAt = (room: string, date: string, block: string) =>
  document.querySelector(
    `[data-cell][data-room='${room}'][data-date='${date}'][data-block='${block}']`,
  ) as HTMLElement;

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
