import { describe, expect, test } from "bun:test";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
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
        item({ id: "f1", date: TUE, start: "08:30", end: "09:50", title: "Física — 2B" }),
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

async function renderOverview() {
  const root = createRootRoute({
    component: () => <RoomsOverview week={WEEK} rooms={WEEK.rooms} />,
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
