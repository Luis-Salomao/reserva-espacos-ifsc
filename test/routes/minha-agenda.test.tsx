import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { MyBooking, MyWeek } from "#/application/bookings";
import { MinhaAgendaScreen, validateMinhaAgendaSearch } from "#/routes/minha-agenda";

afterEach(cleanup);

describe("validateMinhaAgendaSearch", () => {
  test("semana ajustada para segunda; inválida some", () => {
    expect(validateMinhaAgendaSearch({ semana: "2026-11-05" })).toEqual({ semana: "2026-11-02" });
    expect(validateMinhaAgendaSearch({ semana: "x" })).toEqual({});
    expect(validateMinhaAgendaSearch({ semana: "2026-02-31" })).toEqual({});
  });
  test("modo todas exige disciplina", () => {
    expect(validateMinhaAgendaSearch({ modo: "todas" })).toEqual({});
    expect(validateMinhaAgendaSearch({ modo: "todas", disciplina: "redes" })).toEqual({
      disciplina: "redes",
      modo: "todas",
    });
    expect(validateMinhaAgendaSearch({ disciplina: "  " })).toEqual({});
  });
});

const base = {
  spaceId: "s1",
  spaceName: "LAB 1",
  date: "2026-11-17",
  start: "08:00",
  end: "09:40",
  status: "ativa" as const,
  canCancel: true,
  mine: true,
  responsible: true,
  person: null,
  inSeries: false,
};
const imported: MyBooking = { ...base, id: "imp", title: "Cálculo I", source: "import" };
const manual: MyBooking = {
  ...base,
  id: "man",
  title: "Reunião",
  source: "manual",
  date: "2026-11-18",
  canEdit: true,
};

function weekOf(): MyWeek {
  const days = Array.from({ length: 7 }, (_, i) => ({
    date: `2026-11-${16 + i}`,
    spaceId: "",
    now: "2026-11-13T10:00",
    blocks: [],
    hours: { opens: "06:00", closes: "23:00" },
    occupations: [imported, manual].filter((b) => b.date === `2026-11-${16 + i}`),
    free: [],
  }));
  return {
    spaceId: "",
    weekStart: "2026-11-16",
    now: "2026-11-13T10:00",
    days,
    items: [imported, manual],
  } as unknown as MyWeek;
}

function renderScreen() {
  render(
    <MinhaAgendaScreen
      subjects={[]}
      subject={undefined}
      mode="semana"
      week={weekOf()}
      dates={null}
      spaces={[]}
      onSubjectChange={() => {}}
      onModeChange={() => {}}
      onWeekChange={() => {}}
      onChanged={() => {}}
    />,
  );
}

describe("MinhaAgendaScreen", () => {
  test("aula importada: sem Editar e cancelamento sem série", () => {
    renderScreen();
    fireEvent.click(screen.getByText("Cálculo I"));
    expect(screen.queryByRole("button", { name: "Editar…" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar…" }));
    expect(screen.getByText("Desmarcar esta data")).toBeDefined();
    expect(screen.queryByText(/próximas/i)).toBeNull();
  });

  test("reserva manual com canEdit mostra Editar…", () => {
    renderScreen();
    fireEvent.click(screen.getByText("Reunião"));
    expect(screen.getByRole("button", { name: "Editar…" })).toBeDefined();
  });
});
