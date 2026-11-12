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
  periods: [1, 2],
  subject: "Mat",
  classes: "T1",
  teachers: "FT",
  termsLabel: "Semestre 1",
  status: "applicable",
  rooms: ["101"],
};

const room: RoomView = {
  id: "R1",
  short: "101",
  name: "Sala 101",
  slotCount: 1,
  weekdays: [0],
  slots: [slot],
};

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

describe("WeeklyGrid, blocos de vários períodos", () => {
  test("a linha do segundo período mostra a continuação até o fim do bloco", () => {
    render(<WeeklyGrid room={room} periods={periods} />);
    const rows = within(screen.getByRole("table")).getAllByRole("row");
    expect(within(rows[2] as HTMLElement).getByText("continuação: Mat (até 09:40)")).toBeTruthy();
    expect(within(rows[1] as HTMLElement).queryByText(/continuação/)).toBeNull();
  });
});

describe("WeeklyGrid, períodos fora da ordem do relógio", () => {
  const odd = [
    { number: 7, name: "7", short: "7", start: "19:00", end: "22:00" },
    { number: 6, name: "6", short: "6", start: "20:10", end: "22:00" },
  ];

  test("segmento em período numerado fora de ordem cai na linha do período certo", () => {
    const crossing: SlotView = { ...slot, periodFrom: 7, periodTo: 6, periods: [7, 6] };
    render(<WeeklyGrid room={{ ...room, slots: [crossing] }} periods={odd} />);
    const rows = within(screen.getByRole("table")).getAllByRole("row");
    expect(within(rows[1] as HTMLElement).getByText("Mat")).toBeTruthy();
    expect(within(rows[2] as HTMLElement).getByText(/continuação: Mat/)).toBeTruthy();
  });

  test("cada linha tem chave estável e os blocos seguem a ordem recebida", () => {
    render(<WeeklyGrid room={room} periods={odd} />);
    const headers = within(screen.getByRole("table")).getAllByRole("rowheader");
    expect(headers.map((header) => header.textContent)).toEqual(["719:00–22:00", "620:10–22:00"]);
  });
});
