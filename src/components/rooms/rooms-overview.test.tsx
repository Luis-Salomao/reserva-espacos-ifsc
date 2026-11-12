import { describe, expect, test } from "bun:test";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { type ReactNode, useState } from "react";
import type { AgendaItem, RoomsWeek } from "#/application/bookings";
import { RoomsOverview } from "./rooms-overview";

function renderWithRouter(children: () => ReactNode) {
  const root = createRootRoute({ component: () => <>{children()}</> });
  const router = createRouter({
    routeTree: root.addChildren([createRoute({ getParentRoute: () => root, path: "/" })]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return render(<RouterProvider router={router} />);
}

const BLOCKS = [
  { label: "Manhã 1", short: "M1", start: "08:00", end: "09:50" },
  { label: "Manhã 2", short: "M2", start: "10:00", end: "11:50" },
  { label: "Tarde 1", short: "T1", start: "13:00", end: "14:50" },
];
const DATES = ["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13"];

const occupation: AgendaItem = {
  id: "o1",
  date: "2026-11-10",
  start: "08:00",
  end: "09:50",
  title: "CÁLCULO — 1A",
  source: "import",
  status: "ativa",
  person: null,
  mine: false,
  canCancel: false,
};

const makeWeek = (): RoomsWeek => ({
  weekStart: "2026-11-09",
  now: "2026-11-10T12:00",
  days: DATES.map((date) => ({ date, blocks: BLOCKS })),
  rooms: [
    { space: { id: "r1", name: "A-202", capacity: 30 }, occupations: [occupation] },
    { space: { id: "r2", name: "A-203", capacity: 20 }, occupations: [] },
  ],
});

const baseProps = (week: RoomsWeek) => ({
  week,
  rooms: week.rooms,
  isVisitor: false,
  compact: false,
  selectedDate: "2026-11-10",
  canReserve: true,
  onBook: () => {},
});

function Parent() {
  const [renders, setRenders] = useState(0);
  return (
    <>
      <button type="button" onClick={() => setRenders((n) => n + 1)}>
        repintar {renders}
      </button>
      <RoomsOverview {...baseProps(makeWeek())} compact selectedDate="2026-11-10" />
    </>
  );
}

describe("RoomsOverview — dias empilhados", () => {
  test("uma seção por dia, com salas nas linhas e só os blocos do dia nas colunas", async () => {
    const week = makeWeek();
    renderWithRouter(() => <RoomsOverview {...baseProps(week)} />);
    const sections = await screen.findAllByRole("region", { name: /^Ocupação em / });
    expect(sections).toHaveLength(5);
    const tuesday = sections[1] as HTMLElement;
    expect(tuesday.getAttribute("aria-label")).toBe("Ocupação em terça 10/11");
    expect(within(tuesday).getByText("terça 10/11")).toBeDefined();
    expect(within(tuesday).getAllByRole("columnheader")).toHaveLength(1 + BLOCKS.length);
    const rooms = within(tuesday).getAllByRole("rowheader");
    expect(rooms.map((room) => room.textContent)).toEqual(["A-202", "A-203"]);
    expect(within(tuesday).getByText("Manhã 1")).toBeDefined();
    expect(within(tuesday).getByText("08:00–09:50")).toBeDefined();
    expect(within(tuesday).getAllByRole("button", { name: /^Selecionar / })).toHaveLength(
      week.rooms.length * BLOCKS.length - 1,
    );
    expect(tuesday.querySelectorAll("[data-cell='ocupado']")).toHaveLength(1);
  });

  test("destaca o dia de hoje", async () => {
    renderWithRouter(() => <RoomsOverview {...baseProps(makeWeek())} />);
    const sections = await screen.findAllByRole("region", { name: /^Ocupação em / });
    expect(sections[1]?.getAttribute("data-today")).toBe("");
    expect(sections[0]?.getAttribute("data-today")).toBeNull();
  });

  test("clicar num bloco livre abre o painel de seleção", async () => {
    renderWithRouter(() => <RoomsOverview {...baseProps(makeWeek())} />);
    const sections = await screen.findAllByRole("region", { name: /^Ocupação em / });
    const cell = within(sections[2] as HTMLElement).getByRole("button", {
      name: "Selecionar A-203, quarta 11/11, Manhã 2 10:00–11:50",
    });
    fireEvent.click(cell);
    expect(cell.getAttribute("aria-pressed")).toBe("true");
  });

  test("arrastar na mesma sala e dia seleciona blocos contíguos", async () => {
    renderWithRouter(() => <RoomsOverview {...baseProps(makeWeek())} />);
    const sections = await screen.findAllByRole("region", { name: /^Ocupação em / });
    const day = sections[2] as HTMLElement;
    const cells = day.querySelectorAll("[data-room='r2']");
    fireEvent.pointerDown(cells[0] as Element, { button: 0, pointerType: "mouse" });
    fireEvent.pointerEnter(cells[2] as Element);
    expect(day.querySelectorAll("[data-room='r2'][data-selected]")).toHaveLength(3);
    expect(day.querySelectorAll("[data-room='r1'][data-selected]")).toHaveLength(0);
  });

  test("nova semana equivalente a cada render não reinicia a aba nem estoura o limite de atualizações", async () => {
    renderWithRouter(() => <Parent />);
    const tab = await screen.findByRole("tab", { name: "Qua 11" });
    fireEvent.click(tab);
    for (let i = 0; i < 5; i++) fireEvent.click(screen.getByRole("button", { name: /^repintar/ }));
    expect(screen.getByRole("tab", { name: "Qua 11" }).getAttribute("aria-selected")).toBe("true");
  });
});
