import { describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import type { AgendaItem, DayAgenda } from "#/application/bookings";
import type { Draft } from "#/components/agenda/draft-booking";
import { TimelineDay } from "#/components/agenda/timeline-day";

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
  blocks: [],
};

/** Altura na linha do tempo (1,1 px/min, folga de 10 px, abre às 06:00). */
const yAt = (time: string) => {
  const [h = 0, m = 0] = time.split(":").map(Number);
  return 10 + (h * 60 + m - 360) * 1.1;
};

function Harness(props: { onSelectSlot: (slot: unknown) => void; canDraft?: boolean }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  return (
    <TimelineDay
      dayAgenda={day}
      onSelectSlot={props.onSelectSlot}
      isVisitor={false}
      draft={draft}
      canDraft={props.canDraft ?? true}
      onDraftChange={setDraft}
    />
  );
}

function setup(canDraft = true) {
  const onSelectSlot = mock();
  const { getByTestId } = render(<Harness onSelectSlot={onSelectSlot} canDraft={canDraft} />);
  const column = getByTestId("timeline-day").querySelector(".relative.min-w-0") as HTMLElement;
  const at = (time: string) => ({
    clientY: yAt(time),
    pointerId: 1,
    pointerType: "mouse",
    button: 0,
  });
  const drag = (target: Element, from: string, to: string) => {
    fireEvent.pointerDown(target, at(from));
    fireEvent.pointerMove(column, at(to));
    fireEvent.pointerUp(column, at(to));
  };
  const draftLabel = () =>
    screen.queryByRole("button", { name: /^Rascunho/ })?.getAttribute("aria-label") ?? null;
  return { column, onSelectSlot, at, drag, draftLabel };
}

describe("rascunho arrastado na agenda", () => {
  test("arrastar num horário livre desenha o rascunho em passos de 15 min", () => {
    const { column, drag, draftLabel, onSelectSlot } = setup();
    drag(column, "14:05", "15:35");
    expect(draftLabel()).toBe("Rascunho 14:00–15:30. Abrir para reservar");
    expect(onSelectSlot).not.toHaveBeenCalled();
  });

  test("arrastar para cima também funciona e o rascunho para no fim do intervalo livre", () => {
    const { column, drag, draftLabel } = setup();
    drag(column, "16:00", "14:00");
    expect(draftLabel()).toBe("Rascunho 14:00–16:00. Abrir para reservar");
    drag(column, "17:00", "20:00");
    expect(draftLabel()).toBe("Rascunho 17:00–18:00. Abrir para reservar");
  });

  test("clique simples cria 1 h e não abre o formulário do intervalo inteiro", () => {
    const { column, at, draftLabel, onSelectSlot } = setup();
    fireEvent.pointerDown(column, at("14:00"));
    fireEvent.pointerUp(column, at("14:00"));
    fireEvent.click(column);
    expect(draftLabel()).toBe("Rascunho 14:00–15:00. Abrir para reservar");
    expect(onSelectSlot).not.toHaveBeenCalled();
  });

  test("clicar no rascunho abre o formulário com o horário escolhido", () => {
    const { column, at, drag, onSelectSlot } = setup();
    drag(column, "14:00", "15:00");
    const block = column.querySelector("[data-draft='move']") as HTMLElement;
    fireEvent.pointerDown(block, at("14:30"));
    fireEvent.pointerUp(column, at("14:30"));
    expect(onSelectSlot).toHaveBeenCalledWith({
      spaceId: "s1",
      date: "2026-11-05",
      start: "14:00",
      end: "15:00",
    });
  });

  test("teclado: Enter no rascunho abre o formulário", async () => {
    const { column, drag, onSelectSlot } = setup();
    drag(column, "14:00", "15:00");
    await new Promise((resolve) => setTimeout(resolve, 0));
    fireEvent.click(screen.getByRole("button", { name: /^Rascunho/ }));
    expect(onSelectSlot).toHaveBeenCalledTimes(1);
  });

  test("arrastar o rascunho move mantendo a duração, dentro do intervalo livre", () => {
    const { column, drag, draftLabel } = setup();
    drag(column, "14:00", "15:00");
    const block = column.querySelector("[data-draft='move']") as HTMLElement;
    drag(block, "14:30", "16:30");
    expect(draftLabel()).toBe("Rascunho 16:00–17:00. Abrir para reservar");
    drag(column.querySelector("[data-draft='move']") as HTMLElement, "16:30", "22:00");
    expect(draftLabel()).toBe("Rascunho 17:00–18:00. Abrir para reservar");
  });

  test("puxar a borda de baixo redimensiona", () => {
    const { column, drag, draftLabel } = setup();
    drag(column, "14:00", "15:00");
    drag(column.querySelector("[data-draft='resize']") as HTMLElement, "15:00", "16:15");
    expect(draftLabel()).toBe("Rascunho 14:00–16:15. Abrir para reservar");
  });

  test("descartar remove o rascunho", async () => {
    const { column, drag, draftLabel } = setup();
    drag(column, "14:00", "15:00");
    await new Promise((resolve) => setTimeout(resolve, 0));
    fireEvent.click(screen.getByRole("button", { name: "Descartar rascunho" }));
    expect(draftLabel()).toBeNull();
  });

  test("sobre uma ocupação, ou sem permissão de reservar, não desenha", () => {
    const first = setup();
    first.drag(screen.getByRole("button", { name: /Cálculo I/ }), "08:30", "09:00");
    expect(first.draftLabel()).toBeNull();

    const other = render(<Harness onSelectSlot={() => {}} canDraft={false} />);
    const column = other.container.querySelector(".relative.min-w-0") as HTMLElement;
    fireEvent.pointerDown(column, { clientY: yAt("14:00"), pointerId: 2, pointerType: "mouse" });
    fireEvent.pointerUp(column, { clientY: yAt("14:00"), pointerId: 2, pointerType: "mouse" });
    expect(other.container.querySelector("[data-draft]")).toBeNull();
  });

  test("toque não desenha (rolagem e toque longo continuam como antes)", () => {
    const { column, draftLabel } = setup();
    fireEvent.pointerDown(column, { clientY: yAt("14:00"), pointerId: 3, pointerType: "touch" });
    fireEvent.pointerUp(column, { clientY: yAt("14:00"), pointerId: 3, pointerType: "touch" });
    expect(draftLabel()).toBeNull();
  });
});
