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

describe("RoomsOverview — salas nas colunas, horários nas linhas", () => {
  test("uma tabela só: salas como cabeçalhos de coluna e uma faixa por dia com os blocos nas linhas", async () => {
    const week = makeWeek();
    renderWithRouter(() => <RoomsOverview {...baseProps(week)} />);
    const table = await screen.findByRole("table", { name: /salas nas colunas/i });
    const colunas = within(table)
      .getAllByRole("columnheader")
      .map((header) => header.textContent ?? "");
    expect(colunas.some((texto) => texto.includes("A-202"))).toBe(true);
    expect(colunas.some((texto) => texto.includes("A-203"))).toBe(true);
    const faixas = table.querySelectorAll("tr[aria-label^='Ocupação em ']");
    expect(faixas).toHaveLength(5);
    expect(faixas[1]?.getAttribute("aria-label")).toBe("Ocupação em terça 10/11");
    // 5 dias x 3 blocos, cada um com cabeçalho de linha "bloco + horário".
    expect(within(table).getAllByText("Manhã 1")).toHaveLength(5);
    expect(within(table).getAllByText("08:00–09:50")).toHaveLength(5);
    expect(table.querySelectorAll("[data-cell]")).toHaveLength(
      DATES.length * BLOCKS.length * week.rooms.length,
    );
    expect(table.querySelectorAll("[data-cell='ocupado']")).toHaveLength(1);
  });

  test("destaca o dia de hoje na faixa do dia", async () => {
    renderWithRouter(() => <RoomsOverview {...baseProps(makeWeek())} />);
    const table = await screen.findByRole("table", { name: /salas nas colunas/i });
    const faixas = table.querySelectorAll("tr[aria-label^='Ocupação em ']");
    expect(faixas[1]?.getAttribute("data-today")).toBe("");
    expect(faixas[0]?.getAttribute("data-today")).toBeNull();
    expect(within(faixas[1] as HTMLElement).getByText("Hoje")).toBeDefined();
  });

  test("clicar num bloco livre abre o painel de seleção", async () => {
    renderWithRouter(() => <RoomsOverview {...baseProps(makeWeek())} />);
    const cell = await screen.findByRole("button", {
      name: "Selecionar A-203, quarta 11/11, Manhã 2 10:00–11:50",
    });
    fireEvent.click(cell);
    expect(cell.getAttribute("aria-pressed")).toBe("true");
  });

  test("arrastar para baixo, na mesma sala e dia, seleciona blocos contíguos", async () => {
    renderWithRouter(() => <RoomsOverview {...baseProps(makeWeek())} />);
    await screen.findByRole("table", { name: /salas nas colunas/i });
    const quarta = Array.from(
      document.querySelectorAll<HTMLElement>("[data-room='r2'][data-date='2026-11-11']"),
    );
    expect(quarta).toHaveLength(BLOCKS.length);
    fireEvent.pointerDown(quarta[0] as Element, { button: 0, pointerType: "mouse" });
    fireEvent.pointerEnter(quarta[2] as Element);
    expect(
      document.querySelectorAll("[data-room='r2'][data-date='2026-11-11'][data-selected]"),
    ).toHaveLength(3);
    expect(document.querySelectorAll("[data-room='r1'][data-selected]")).toHaveLength(0);
    expect(
      document.querySelectorAll("[data-room='r2'][data-date='2026-11-10'][data-selected]"),
    ).toHaveLength(0);
  });

  test("nova semana equivalente a cada render não reinicia a aba nem estoura o limite de atualizações", async () => {
    renderWithRouter(() => <Parent />);
    const tab = await screen.findByRole("tab", { name: "Qua 11" });
    fireEvent.click(tab);
    for (let i = 0; i < 5; i++) fireEvent.click(screen.getByRole("button", { name: /^repintar/ }));
    expect(screen.getByRole("tab", { name: "Qua 11" }).getAttribute("aria-selected")).toBe("true");
  });
});
