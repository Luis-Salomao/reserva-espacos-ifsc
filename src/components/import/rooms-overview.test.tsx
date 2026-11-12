import { describe, expect, test } from "bun:test";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { OverlapView, RoomView, SlotView } from "#/server/import-preview-view";
import { ImportRoomsOverview } from "./rooms-overview";

const slot = (key: string, weekday: number): SlotView => ({
  key,
  weekday,
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
  rooms: ["A-202"],
});

const rooms: RoomView[] = [
  {
    id: "R1",
    short: "A-202",
    name: "Sala A-202",
    slotCount: 3,
    weekdays: [0, 2, 4],
    slots: [slot("s1", 0), slot("s2", 2)],
  },
  { id: "R2", short: "A-203", name: " A-203 ", slotCount: 0, weekdays: [], slots: [] },
];

const periods = [{ number: 1, name: "Manhã", short: "M1", start: "08:00", end: "09:40" }];

const overlap: OverlapView = {
  key: "ov-1",
  roomId: "R1",
  room: "A-202",
  weekday: 0,
  kind: "possible",
  a: { label: "Mat", classes: "T1", start: "08:00", end: "09:40" },
  b: { label: "Fis", classes: "T2", start: "09:00", end: "10:40" },
};

describe("ImportRoomsOverview", () => {
  test("guia a conferência sala a sala e prioriza salas com sobreposição", () => {
    render(
      <ImportRoomsOverview
        rooms={rooms}
        overlaps={[overlap]}
        truncated={false}
        periods={periods}
      />,
    );

    const table = screen.getByRole("table", { name: "Visão geral das salas do arquivo" });
    expect(within(table).getByText(/A-202/)).toBeTruthy();
    expect(within(table).getByText("A-203")).toBeTruthy();
    expect(within(table).queryByText(/A-203 — A-203/)).toBeNull();
    expect(within(table).getByText("3 horários")).toBeTruthy();
    expect(within(table).getByText("3 dias")).toBeTruthy();
    expect(within(table).getByText(/1 possível/)).toBeTruthy();
    expect(within(table).getByText("0 horários")).toBeTruthy();
    expect(screen.getByText("1 com sobreposição apontada")).toBeTruthy();
    expect(screen.getByText("1 sem horários listados")).toBeTruthy();
    expect(within(table).getAllByRole("row")[1]?.textContent).toContain("A-202");
    expect(screen.getByText("Conferência sala a sala · 1 de 2")).toBeTruthy();
    const guidedReview = screen.getByRole("region", { name: "Conferência sala a sala" });
    expect(within(guidedReview).getByRole("heading", { name: "A-202 — Sala A-202" })).toBeTruthy();
    expect(
      within(guidedReview).getByText(/contagem inclui aulas que listam várias salas/),
    ).toBeTruthy();
    expect(screen.getByText("Sobreposições apontadas nesta sala")).toBeTruthy();
    expect(screen.getByText("Sobreposição possível · Segunda-feira")).toBeTruthy();
    expect(screen.getAllByText("Mat").length).toBeGreaterThan(0);

    const selectRoom = within(table).getByRole("button", {
      name: "Abrir A-203 na conferência sala a sala",
    });
    fireEvent.click(selectRoom);
    expect(screen.getByText("Conferência sala a sala · 2 de 2")).toBeTruthy();
    expect(within(guidedReview).getByRole("heading", { name: "A-203" })).toBeTruthy();
    expect(screen.getByText("Nenhum horário desta sala foi encontrado no arquivo.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Sala anterior" }));
    expect(within(guidedReview).getByRole("heading", { name: "A-202 — Sala A-202" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Próxima sala" }));
    expect(within(guidedReview).getByRole("heading", { name: "A-203" })).toBeTruthy();
  });

  test("avisa quando o detalhamento de sobreposições foi truncado", () => {
    render(<ImportRoomsOverview rooms={rooms} overlaps={[overlap]} truncated periods={periods} />);
    expect(screen.getByRole("status").textContent).toContain(
      "totais por sala podem estar parciais",
    );
  });
});
