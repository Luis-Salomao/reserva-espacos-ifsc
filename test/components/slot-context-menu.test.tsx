import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { AgendaItem, DayAgenda } from "#/application/bookings";
import { TimelineDay } from "#/components/agenda/timeline-day";

afterEach(cleanup);

const lesson: AgendaItem = {
  id: "o1",
  date: "2026-11-05",
  start: "08:00",
  end: "09:40",
  title: "Cálculo I",
  source: "import",
  status: "ativa",
  canCancel: false,
  mine: false,
  person: null,
};

const day: DayAgenda = {
  spaceId: "s1",
  date: "2026-11-05",
  now: "2026-11-04T10:00",
  hours: { opens: "06:00", closes: "23:00" },
  occupations: [lesson],
  free: [
    { start: "06:00", end: "08:00" },
    { start: "13:30", end: "18:00" },
  ],
  blocks: [{ label: "Tarde 2", short: "T2", start: "14:15", end: "15:00" }],
};

/** Altura na linha do tempo (1,1 px/min, folga de 10 px, abre às 06:00). */
const yAt = (time: string) => {
  const [h = 0, m = 0] = time.split(":").map(Number);
  return 10 + (h * 60 + m - 360) * 1.1;
};

function setup() {
  const onSelectSlot = mock();
  const onOpenOccupation = mock();
  const { getByTestId } = render(
    <TimelineDay
      dayAgenda={day}
      onSelectSlot={onSelectSlot}
      onOpenOccupation={onOpenOccupation}
      isVisitor={false}
    />,
  );
  const column = getByTestId("timeline-day").querySelector(".relative.min-w-0") as HTMLElement;
  return { column, onSelectSlot, onOpenOccupation };
}

describe("botão direito na agenda", () => {
  test("num horário livre oferece 1 h a partir da meia hora, o bloco e o intervalo inteiro", async () => {
    const { column, onSelectSlot } = setup();
    fireEvent.contextMenu(column, { clientX: 50, clientY: yAt("14:20") });
    expect(await screen.findByText(/qui\., 5 de nov\. · 14:00/i)).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /Bloco T2 · 14:15–15:00/ })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /Todo o horário livre 13:30–18:00/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("menuitem", { name: /Nova reserva 14:00–15:00/ }));
    expect(onSelectSlot).toHaveBeenCalledWith({
      spaceId: "s1",
      date: "2026-11-05",
      start: "14:00",
      end: "15:00",
    });
  });

  test("escolher o bloco reserva exatamente o bloco", async () => {
    const { column, onSelectSlot } = setup();
    fireEvent.contextMenu(column, { clientX: 50, clientY: yAt("14:20") });
    fireEvent.click(await screen.findByRole("menuitem", { name: /Bloco T2/ }));
    expect(onSelectSlot).toHaveBeenCalledWith({
      spaceId: "s1",
      date: "2026-11-05",
      start: "14:15",
      end: "15:00",
    });
  });

  test("perto do fim do intervalo a reserva rápida para no limite livre", async () => {
    const { column } = setup();
    fireEvent.contextMenu(column, { clientX: 50, clientY: yAt("07:40") });
    expect(await screen.findByRole("menuitem", { name: /Nova reserva 07:30–08:00/ })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: /Bloco/ })).toBeNull();
  });

  test("em cima de uma ocupação oferece ver os detalhes", async () => {
    const { column, onOpenOccupation, onSelectSlot } = setup();
    fireEvent.contextMenu(column, { clientX: 50, clientY: yAt("08:30") });
    fireEvent.click(await screen.findByRole("menuitem", { name: /Ver Cálculo I/ }));
    expect(onOpenOccupation).toHaveBeenCalledWith(lesson);
    expect(onSelectSlot).not.toHaveBeenCalled();
  });

  test("fora do expediente livre (nem livre nem ocupado) não abre menu", () => {
    const { column } = setup();
    fireEvent.contextMenu(column, { clientX: 50, clientY: yAt("20:00") });
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
