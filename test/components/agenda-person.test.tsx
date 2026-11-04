import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { AgendaItem, DayAgenda } from "#/application/bookings";
import { OccupationDetails } from "#/components/agenda/occupation-details";
import { TimelineDay } from "#/components/agenda/timeline-day";

afterEach(cleanup);

const item = (overrides: Partial<AgendaItem> = {}): AgendaItem => ({
  id: "o1",
  date: "2026-11-03",
  start: "08:00",
  end: "09:40",
  title: "Cálculo I",
  source: "import",
  status: "ativa",
  canCancel: false,
  mine: false,
  person: { name: "Fabiana Lima", code: "FLIMA" },
  ...overrides,
});

const day = (occupations: AgendaItem[], now = "2026-11-03T08:30"): DayAgenda => ({
  spaceId: "s1",
  date: "2026-11-03",
  now,
  hours: { opens: "06:00", closes: "23:00" },
  occupations,
  free: [],
  blocks: [],
});

describe("responsável na grade", () => {
  test("mostra nome do responsável no cartão quando a ocupação traz pessoa", () => {
    render(<TimelineDay dayAgenda={day([item()])} onSelectSlot={() => {}} isVisitor={false} />);
    const card = screen.getByRole("button", { name: /Cálculo I/ });
    expect(within(card).getByText("Fabiana Lima")).toBeTruthy();
    expect(within(card).getByText("FL")).toBeTruthy();
  });

  test("ocupação curta guarda o nome só para leitores de tela", () => {
    render(
      <TimelineDay
        dayAgenda={day([item({ start: "08:00", end: "08:30" })])}
        onSelectSlot={() => {}}
        isVisitor={false}
      />,
    );
    expect(screen.getByText("Fabiana Lima").className).toContain("sr-only");
  });

  test("sem pessoa (visitante) não há nome nem avatar", () => {
    render(
      <TimelineDay
        dayAgenda={day([item({ person: null })])}
        onSelectSlot={() => {}}
        isVisitor={true}
      />,
    );
    const card = screen.getByRole("button", { name: /Cálculo I/ });
    expect(card.textContent).not.toContain("Fabiana");
    expect(within(card).queryByText("FL") === null).toBe(true);
  });

  test("abre a ocupação ao clicar no cartão", () => {
    const onOpen = mock();
    render(
      <TimelineDay
        dayAgenda={day([item()])}
        onSelectSlot={() => {}}
        onOpenOccupation={onOpen}
        isVisitor={false}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Cálculo I/ }));
    expect(onOpen.mock.calls[0]?.[0]).toMatchObject({ id: "o1", title: "Cálculo I" });
  });

  test("linha do agora só aparece no dia de hoje dentro do expediente", () => {
    const { container, rerender } = render(
      <TimelineDay dayAgenda={day([])} onSelectSlot={() => {}} isVisitor={false} />,
    );
    const hasNowLine = () => container.querySelector(".border-primary") !== null;
    expect(hasNowLine()).toBe(true);
    rerender(
      <TimelineDay
        dayAgenda={day([], "2026-11-04T08:30")}
        onSelectSlot={() => {}}
        isVisitor={false}
      />,
    );
    expect(hasNowLine()).toBe(false);
    rerender(
      <TimelineDay
        dayAgenda={day([], "2026-11-03T23:30")}
        onSelectSlot={() => {}}
        isVisitor={false}
      />,
    );
    expect(hasNowLine()).toBe(false);
  });
});

describe("detalhes da ocupação", () => {
  test("aula importada mostra Responsável com nome e sigla", () => {
    render(
      <OccupationDetails
        occupation={item()}
        spaceName="ADM 2"
        onOpenChange={() => {}}
        onCancel={() => {}}
      />,
    );
    const dialog = screen.getByRole("dialog", { name: "Cálculo I" });
    expect(within(dialog).getByText("Responsável")).toBeTruthy();
    expect(within(dialog).getByText(/Fabiana Lima/)).toBeTruthy();
    expect(within(dialog).getByText("FLIMA")).toBeTruthy();
    expect(within(dialog).getByText("ADM 2")).toBeTruthy();
    expect(within(dialog).getByText("08:00–09:40")).toBeTruthy();
    expect(within(dialog).queryByRole("button", { name: "Cancelar…" })).toBeNull();
  });

  test("reserva avulsa: Reservado por, e Cancelar quando permitido", () => {
    const onCancel = mock();
    render(
      <OccupationDetails
        occupation={item({
          source: "manual",
          title: "Reunião",
          canCancel: true,
          mine: true,
          person: { name: "Ryan Costa", code: null },
        })}
        spaceName="LAB 1"
        onOpenChange={() => {}}
        onCancel={onCancel}
      />,
    );
    const dialog = screen.getByRole("dialog", { name: "Reunião" });
    expect(within(dialog).getByText("Reservado por")).toBeTruthy();
    expect(within(dialog).getByText(/Reserva · sua/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancelar…" }));
    expect(onCancel.mock.calls[0]?.[0]).toMatchObject({ title: "Reunião" });
  });

  test("visitante: sem bloco de pessoa", () => {
    render(
      <OccupationDetails
        occupation={item({ person: null })}
        spaceName="ADM 2"
        onOpenChange={() => {}}
        onCancel={() => {}}
      />,
    );
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryByText("Responsável")).toBeNull();
    expect(dialog.textContent).not.toContain("Fabiana");
  });

  test("fechado quando não há ocupação; fechar avisa o pai", () => {
    const onOpenChange = mock();
    const { rerender } = render(
      <OccupationDetails
        occupation={null}
        spaceName="ADM 2"
        onOpenChange={onOpenChange}
        onCancel={() => {}}
      />,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    rerender(
      <OccupationDetails
        occupation={item()}
        spaceName="ADM 2"
        onOpenChange={onOpenChange}
        onCancel={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Fechar detalhes" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
