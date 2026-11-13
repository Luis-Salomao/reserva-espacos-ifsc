import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { MyBooking, MyDates, MyWeek } from "#/application/bookings";
import { MyAgendaView } from "./my-agenda-view";

afterEach(cleanup);

const item: MyBooking = {
  id: "b1",
  spaceId: "s1",
  spaceName: "LAB 1",
  date: "2026-11-17",
  start: "08:00",
  end: "09:40",
  title: "Cálculo I",
  source: "import",
  status: "ativa",
  canCancel: true,
  mine: true,
  responsible: true,
  person: null,
  inSeries: false,
};

function week(): MyWeek {
  return { spaceId: "", weekStart: "2026-11-16", now: "2026-11-13T10:00", days: [], items: [] };
}

function setup(over: Partial<Parameters<typeof MyAgendaView>[0]> = {}) {
  const props = {
    subjects: [
      { key: "calculo-i", label: "Cálculo I", count: 12 },
      { key: "redes", label: "Redes", count: 3 },
    ],
    subject: undefined,
    mode: "semana" as const,
    week: week(),
    dates: null,
    onSubjectChange: mock(() => {}),
    onModeChange: mock(() => {}),
    onWeekChange: mock(() => {}),
    onOpen: mock(() => {}),
    onDisable: mock(() => {}),
    ...over,
  };
  render(<MyAgendaView {...props} />);
  return props;
}

describe("MyAgendaView", () => {
  test("seletor lista disciplinas com contagem e notifica a escolha", () => {
    const props = setup();
    expect(screen.getByRole("option", { name: "Cálculo I (12)" })).toBeDefined();
    fireEvent.change(screen.getByLabelText("Disciplina"), { target: { value: "redes" } });
    expect(props.onSubjectChange).toHaveBeenCalledWith("redes");
  });

  test("Todas as datas fica desabilitado sem disciplina", () => {
    setup();
    expect(
      (screen.getByRole("button", { name: "Todas as datas" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  test("modo todas: cada item tem Desmarcar", () => {
    const dates: MyDates = { now: "2026-11-13T10:00", items: [item] };
    const props = setup({ subject: "calculo-i", mode: "todas", dates });
    fireEvent.click(screen.getByRole("button", { name: "Desmarcar" }));
    expect(props.onDisable).toHaveBeenCalledWith(item);
  });

  test("lista vazia", () => {
    setup({ subject: "calculo-i", mode: "todas", dates: { now: "x", items: [] } });
    expect(screen.getByText("Nenhuma data futura para esta disciplina.")).toBeDefined();
  });

  test("navegação de semana", () => {
    const props = setup();
    fireEvent.click(screen.getByRole("button", { name: "Semana seguinte" }));
    expect(props.onWeekChange).toHaveBeenCalledWith("2026-11-23");
  });

  test("disciplina da URL fora da lista aparece como opção extra", () => {
    setup({ subject: "sumiu" });
    expect(screen.getByRole("option", { name: "(sem datas futuras)" })).toBeDefined();
    expect((screen.getByLabelText("Disciplina") as unknown as HTMLSelectElement).value).toBe(
      "sumiu",
    );
  });

  test("semana sem itens mostra mensagem; com itens não", () => {
    setup();
    expect(screen.getByText("Nenhuma ocupação nesta semana.")).toBeDefined();
    cleanup();
    setup({ week: { ...week(), items: [item] } });
    expect(screen.queryByText("Nenhuma ocupação nesta semana.")).toBeNull();
  });
});
