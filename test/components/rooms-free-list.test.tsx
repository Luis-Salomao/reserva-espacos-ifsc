import { describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { RoomDay } from "#/application/bookings";
import { RoomsFreeList } from "#/components/rooms/rooms-free-list";

const DATE = "2026-11-10";
const NOW = "2026-11-03T09:00";
const WINDOW = { start: "14:00", end: "16:00" };

function room(
  id: string,
  name: string,
  capacity: number | null,
  free: { start: string; end: string }[],
): RoomDay {
  return {
    spaceId: id,
    date: DATE,
    now: NOW,
    hours: { opens: "06:00", closes: "23:00" },
    occupations: [],
    free,
    blocks: [],
    space: { id, name, capacity },
  };
}

const ALL_DAY = [{ start: "06:00", end: "23:00" }];
const ROOMS = [
  room("a202", "A-202", 40, ALL_DAY),
  room("b104", "B-104", 25, [
    { start: "06:00", end: "14:00" },
    { start: "15:00", end: "23:00" },
  ]),
  room("aud", "Auditório", null, ALL_DAY),
];

function renderList(over: Partial<Parameters<typeof RoomsFreeList>[0]> = {}) {
  const onBook = mock();
  const onClearFilters = mock();
  render(
    <RoomsFreeList
      rooms={ROOMS}
      window={WINDOW}
      now={NOW}
      canBook
      onBook={onBook}
      onClearFilters={onClearFilters}
      {...over}
    />,
  );
  return { onBook, onClearFilters };
}

const items = () => screen.getAllByRole("listitem");

describe("RoomsFreeList", () => {
  test("lista só as salas inteiramente livres na janela, com nome, bloco e capacidade", () => {
    renderList();
    expect(items().map((item) => within(item).getByRole("heading").textContent)).toEqual([
      "A-202",
      "Auditório",
    ]);
    const [a202, aud] = items();
    expect(a202?.textContent).toContain("Bloco A");
    expect(a202?.textContent).toContain("40 lugares");
    expect(aud?.textContent).toContain("Outros espaços");
    expect(aud?.textContent).toContain("Capacidade não cadastrada");
  });

  test("'Reservar' entrega a sala, a data e a janela escolhida", () => {
    const { onBook } = renderList();
    fireEvent.click(within(items()[1] as HTMLElement).getByRole("button", { name: /Reservar/ }));
    expect(onBook).toHaveBeenCalledWith({
      spaceId: "aud",
      date: DATE,
      start: "14:00",
      end: "16:00",
    });
  });

  test("quem não pode reservar não vê 'Reservar'", () => {
    renderList({ canBook: false });
    expect(items()).toHaveLength(2);
    expect(screen.queryByRole("button", { name: /Reservar/ })).toBeNull();
  });

  test("sem sala livre, avisa e oferece 'Limpar filtros'", () => {
    const { onClearFilters } = renderList({
      window: { start: "14:30", end: "15:30" },
      rooms: [ROOMS[1] as RoomDay],
    });
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(screen.getByText("Nenhuma sala com esses filtros")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Limpar filtros" }));
    expect(onClearFilters).toHaveBeenCalledTimes(1);
  });
});
