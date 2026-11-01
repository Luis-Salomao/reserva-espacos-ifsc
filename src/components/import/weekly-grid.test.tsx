import { describe, expect, test } from "bun:test";
import { render, screen, within } from "@testing-library/react";
import type { RoomView, SlotView } from "#/server/import-preview-view";
import { WeeklyGrid } from "./weekly-grid";

const periods = [
  { number: 1, name: "1", short: "1", start: "08:00", end: "08:50" },
  { number: 2, name: "2", short: "2", start: "08:50", end: "09:40" },
];

const slot: SlotView = {
  key: "L1:0:1:0",
  weekday: 0,
  start: "08:00",
  end: "09:40",
  periodFrom: 1,
  periodTo: 2,
  subject: "Mat",
  classes: "T1",
  teachers: "FT",
  termsLabel: "Semestre 1",
  status: "applicable",
  rooms: ["101"],
};

const room: RoomView = { id: "R1", short: "101", name: "Sala 101", slots: [slot] };

describe("WeeklyGrid", () => {
  test("mostra disciplina, horário e texto de status do slot", () => {
    render(<WeeklyGrid room={room} periods={periods} />);
    expect(screen.getAllByText("Mat").length).toBeGreaterThan(0);
    expect(screen.getAllByText("08:00–09:40").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Importado · Semestre 1/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Docente: FT").length).toBeGreaterThan(0);
  });

  test("tabela traz os blocos com horário real e coloca o slot no dia e bloco certos", () => {
    render(<WeeklyGrid room={room} periods={periods} />);
    const table = screen.getByRole("table");
    expect(within(table).getByText("08:50–09:40")).toBeTruthy();
    const rows = within(table).getAllByRole("row");
    expect(within(rows[1] as HTMLElement).getByText("Mat")).toBeTruthy();
    expect(within(rows[2] as HTMLElement).queryByText("Mat")).toBeNull();
  });

  test("lista por dia mostra os cinco dias úteis, mesmo vazios", () => {
    render(<WeeklyGrid room={room} periods={periods} />);
    expect(screen.getByRole("region", { name: "Sexta-feira" }).textContent).toContain(
      "Sem horários.",
    );
  });

  test("inclui o sábado quando há horário nele", () => {
    const saturday = { ...room, slots: [{ ...slot, weekday: 5 }] };
    render(<WeeklyGrid room={saturday} periods={periods} />);
    expect(screen.getByRole("region", { name: "Sábado" })).toBeTruthy();
  });

  test("sala sem horários mostra mensagem", () => {
    render(<WeeklyGrid room={{ ...room, slots: [] }} periods={periods} />);
    expect(screen.getByText("Nenhum horário importado para esta sala.")).toBeTruthy();
  });
});
