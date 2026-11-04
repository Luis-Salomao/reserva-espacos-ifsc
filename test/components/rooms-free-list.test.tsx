import { describe, expect, mock, test } from "bun:test";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { AgendaItem, RoomDay } from "#/application/bookings";
import { RoomsFreeList } from "#/components/rooms/rooms-free-list";

const DATE = "2026-11-10";
const NOW = "2026-11-03T09:00";
const WINDOW = { start: "14:00", end: "16:00" };

function room(
  id: string,
  name: string,
  capacity: number | null,
  free: { start: string; end: string }[],
  occupations: AgendaItem[] = [],
): RoomDay {
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
  person: { name: "Ana Souza", code: "1234", placeholder: false },
};

const ALL_DAY = [{ start: "06:00", end: "23:00" }];
const ROOMS = [
  room("a202", "A-202", 40, ALL_DAY),
  room(
    "b104",
    "B-104",
    25,
    [
      { start: "06:00", end: "14:00" },
      { start: "15:00", end: "23:00" },
    ],
    [lesson],
  ),
  room("aud", "Auditório", null, ALL_DAY),
];

/** O nome da sala é um link do roteador: a lista precisa de um roteador em volta. */
async function renderList(over: Partial<Parameters<typeof RoomsFreeList>[0]> = {}) {
  const onBook = mock();
  const onClearFilters = mock();
  const root = createRootRoute({
    component: () => (
      <div data-testid="list">
        <RoomsFreeList
          rooms={ROOMS}
          window={WINDOW}
          now={NOW}
          canBook
          onBook={onBook}
          onClearFilters={onClearFilters}
          {...over}
        />
      </div>
    ),
  });
  const router = createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: ["/?visao=livres"] }),
  });
  render(<RouterProvider router={router} />);
  await screen.findByTestId("list");
  return { onBook, onClearFilters };
}

const freeItems = () =>
  within(screen.getByRole("list", { name: "Salas livres" })).getAllByRole("listitem");
const busyItems = () =>
  within(screen.getByRole("list", { name: "Salas ocupadas" })).getAllByRole("listitem");
const headingOf = (item: HTMLElement) => within(item).getByRole("heading").textContent;

describe("RoomsFreeList", () => {
  test("lista as salas inteiramente livres na janela, com nome, bloco e capacidade", async () => {
    await renderList();
    expect(freeItems().map(headingOf)).toEqual(["A-202", "Auditório"]);
    const [a202, aud] = freeItems();
    expect(a202?.textContent).toContain("Bloco A");
    expect(a202?.textContent).toContain("40 lugares");
    expect(aud?.textContent).toContain("Outros espaços");
    expect(aud?.textContent).toContain("Capacidade não cadastrada");
  });

  test("depois das livres, o título 'Ocupadas' separa as salas ocupadas com o motivo", async () => {
    await renderList();
    const title = screen.getByRole("heading", { name: "Ocupadas" });
    const busyList = screen.getByRole("list", { name: "Salas ocupadas" });
    const freeList = screen.getByRole("list", { name: "Salas livres" });
    expect(freeList.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(title.compareDocumentPosition(busyList) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(busyItems().map(headingOf)).toEqual(["B-104"]);
    expect(within(busyItems()[0] as HTMLElement).getByText("Cálculo I, 14:00–15:00")).toBeDefined();
  });

  test("o motivo não mostra pessoas", async () => {
    await renderList();
    expect(busyItems()[0]?.textContent?.includes("Ana Souza")).toBe(false);
    expect(busyItems()[0]?.querySelector("[data-slot='avatar']") === null).toBe(true);
  });

  test("janela que já começou mostra 'Horário já passou' nas ocupadas", async () => {
    await renderList({ now: `${DATE}T14:30` });
    expect(screen.queryByRole("list", { name: "Salas livres" }) === null).toBe(true);
    expect(busyItems().map(headingOf)).toEqual(["A-202", "B-104", "Auditório"]);
    expect(within(busyItems()[0] as HTMLElement).getByText("Horário já passou")).toBeDefined();
    expect(within(busyItems()[1] as HTMLElement).getByText("Cálculo I, 14:00–15:00")).toBeDefined();
  });

  test("ocupada não tem 'Reservar'", async () => {
    await renderList();
    expect(within(busyItems()[0] as HTMLElement).queryByRole("button") === null).toBe(true);
  });

  test("'Reservar' entrega a sala, a data e a janela escolhida", async () => {
    const { onBook } = await renderList();
    fireEvent.click(
      within(freeItems()[1] as HTMLElement).getByRole("button", { name: /Reservar/ }),
    );
    expect(onBook).toHaveBeenCalledWith({
      spaceId: "aud",
      date: DATE,
      start: "14:00",
      end: "16:00",
    });
  });

  test("quem não pode reservar não vê 'Reservar'", async () => {
    await renderList({ canBook: false });
    expect(freeItems()).toHaveLength(2);
    expect(screen.queryByRole("button", { name: /Reservar/ }) === null).toBe(true);
  });

  test("sem sala livre na janela, avisa e ainda lista as ocupadas", async () => {
    await renderList({ window: { start: "14:30", end: "15:30" }, rooms: [ROOMS[1] as RoomDay] });
    expect(screen.getByText("Nenhuma sala livre nessa janela")).toBeDefined();
    expect(busyItems().map(headingOf)).toEqual(["B-104"]);
  });

  test("sem sala nos filtros, avisa e oferece 'Limpar filtros'", async () => {
    const { onClearFilters } = await renderList({ rooms: [] });
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(screen.getByText("Nenhuma sala com esses filtros")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Limpar filtros" }));
    expect(onClearFilters).toHaveBeenCalledTimes(1);
  });
});
