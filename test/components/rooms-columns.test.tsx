import { describe, expect, mock, test } from "bun:test";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import type { AgendaItem, RoomDay } from "#/application/bookings";
import { type RoomDraft, RoomsColumns } from "#/components/rooms/rooms-columns";

const DATE = "2026-11-10";

function room(id: string, name: string, occupations: AgendaItem[] = []): RoomDay {
  return {
    spaceId: id,
    date: DATE,
    now: "2026-11-03T09:00",
    hours: { opens: "06:00", closes: "23:00" },
    occupations,
    free:
      occupations.length === 0
        ? [{ start: "06:00", end: "23:00" }]
        : [
            { start: "06:00", end: "08:00" },
            { start: "09:40", end: "23:00" },
          ],
    blocks: [],
    space: { id, name, capacity: null },
  };
}

const lesson: AgendaItem = {
  id: "o1",
  date: DATE,
  start: "08:00",
  end: "09:40",
  title: "Cálculo I",
  source: "import",
  status: "ativa",
  canCancel: false,
  mine: false,
  person: null,
};

const ROOMS = [room("a202", "A-202", [lesson]), room("b104", "B-104"), room("lab", "LAB 1")];

/** Altura na coluna (0,9 px/min, folga de 10 px, abre às 06:00). */
const yAt = (time: string) => {
  const [h = 0, m = 0] = time.split(":").map(Number);
  return 10 + (h * 60 + m - 360) * 0.9;
};

const at = (time: string) => ({
  clientY: yAt(time),
  pointerId: 1,
  pointerType: "mouse",
  button: 0,
});

function Harness(props: { canDraft: boolean; onSelectSlot: (slot: unknown) => void }) {
  const [draft, setDraft] = useState<RoomDraft | null>(null);
  return (
    <RoomsColumns
      rooms={ROOMS}
      date={DATE}
      now="2026-11-03T09:00"
      draft={draft}
      canDraft={props.canDraft}
      onDraftChange={setDraft}
      onSelectSlot={props.onSelectSlot}
    />
  );
}

async function renderColumns(canDraft = true) {
  const onSelectSlot = mock();
  const root = createRootRoute({
    component: () => <Harness canDraft={canDraft} onSelectSlot={onSelectSlot} />,
  });
  const router = createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: ["/salas"] }),
  });
  render(<RouterProvider router={router} />);
  await screen.findByTestId("rooms-columns");
  const column = (id: string) =>
    document.querySelector(`[data-room-column='${id}'] .relative.min-w-0`) as HTMLElement;
  const drag = (target: Element, scope: HTMLElement, from: string, to: string) => {
    fireEvent.pointerDown(target, at(from));
    fireEvent.pointerMove(scope, at(to));
    fireEvent.pointerUp(scope, at(to));
  };
  const drafts = () => screen.queryAllByRole("button", { name: /^Rascunho/ });
  return { onSelectSlot, column, drag, drafts };
}

describe("RoomsColumns", () => {
  test("uma coluna por sala, na ordem recebida, cada uma com as próprias ocupações", async () => {
    const { column } = await renderColumns();
    expect(screen.getAllByRole("link").map((link) => link.textContent)).toEqual([
      "A-202",
      "B-104",
      "LAB 1",
    ]);
    expect(within(column("a202")).getByRole("button", { name: /Cálculo I/ })).toBeDefined();
    expect(within(column("b104")).queryByRole("button", { name: /Cálculo I/ })).toBeNull();
  });

  test("o nome da sala leva à agenda dela no mesmo dia", async () => {
    await renderColumns();
    expect(screen.getByRole("link", { name: "B-104" }).getAttribute("href")).toBe(
      `/?espaco=b104&data=${DATE}`,
    );
  });

  test("o rascunho aparece só na coluna da sala onde foi desenhado e muda de sala ao desenhar outro", async () => {
    const { column, drag, drafts } = await renderColumns();
    drag(column("b104"), column("b104"), "14:00", "15:30");
    expect(drafts()).toHaveLength(1);
    expect(
      within(column("b104"))
        .getByRole("button", { name: /^Rascunho/ })
        .getAttribute("aria-label"),
    ).toBe("Rascunho 14:00–15:30. Abrir para reservar");
    expect(within(column("lab")).queryByRole("button", { name: /^Rascunho/ })).toBeNull();

    drag(column("lab"), column("lab"), "10:00", "11:00");
    expect(drafts()).toHaveLength(1);
    expect(within(column("lab")).queryByRole("button", { name: /^Rascunho/ })).not.toBeNull();
    expect(within(column("b104")).queryByRole("button", { name: /^Rascunho/ })).toBeNull();
  });

  test("clicar no rascunho entrega sala, data e horário", async () => {
    const { column, drag, onSelectSlot } = await renderColumns();
    drag(column("b104"), column("b104"), "14:00", "15:30");
    await new Promise((resolve) => setTimeout(resolve, 0));
    fireEvent.click(screen.getByRole("button", { name: /^Rascunho/ }));
    expect(onSelectSlot).toHaveBeenCalledWith({
      spaceId: "b104",
      date: DATE,
      start: "14:00",
      end: "15:30",
    });
  });

  test("sem permissão de reservar, arrastar não desenha rascunho", async () => {
    const { column, drag, drafts } = await renderColumns(false);
    drag(column("b104"), column("b104"), "14:00", "15:30");
    expect(drafts()).toHaveLength(0);
  });

  test("a rolagem horizontal fica dentro da grade, com colunas de no mínimo 140 px", async () => {
    await renderColumns();
    const grid = screen.getByTestId("rooms-columns");
    expect(grid.className).toContain("overflow-auto");
    const template = (grid.firstElementChild as HTMLElement).style.gridTemplateColumns;
    expect(template).toBe("52px repeat(3, minmax(140px, 1fr))");
    // Elemento sticky não sai do bloco que o contém: a grade tem a largura do conteúdo.
    expect((grid.firstElementChild as HTMLElement).className.split(" ")).toEqual(
      expect.arrayContaining(["w-max", "min-w-full"]),
    );
  });

  test("nomes das salas ficam fixos no topo e o eixo de horas fixo à esquerda ao rolar a grade", async () => {
    await renderColumns();
    const grid = screen.getByTestId("rooms-columns");
    const headers = within(grid)
      .getAllByRole("link")
      .map((link) => (link.parentElement as HTMLElement).className.split(" "));
    expect(headers).toHaveLength(3);
    for (const classes of headers)
      expect(classes).toEqual(expect.arrayContaining(["sticky", "top-0"]));
    const cells = Array.from((grid.firstElementChild as HTMLElement).children) as HTMLElement[];
    const axis = cells[headers.length + 1];
    expect(axis?.className.split(" ")).toEqual(expect.arrayContaining(["sticky", "left-0"]));
    expect(cells[0]?.className.split(" ")).toEqual(
      expect.arrayContaining(["sticky", "top-0", "left-0"]),
    );
  });
});
