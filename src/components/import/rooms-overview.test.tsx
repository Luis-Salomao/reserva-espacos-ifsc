import { describe, expect, mock, test } from "bun:test";
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
  { id: "R2", short: "A-203", name: "Sala A-203", slotCount: 0, weekdays: [], slots: [] },
];

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
  test("resume todas as salas sem trocar o seletor individual e destaca horários e avisos", () => {
    const onShowRoom = mock((_id: string) => {});
    render(
      <ImportRoomsOverview
        rooms={rooms}
        overlaps={[overlap]}
        truncated={false}
        onShowRoom={onShowRoom}
      />,
    );

    const table = screen.getByRole("table", { name: "Visão geral das salas do arquivo" });
    expect(within(table).getByText("A-202")).toBeTruthy();
    expect(within(table).getByText("A-203")).toBeTruthy();
    expect(within(table).getByText("3 ocorrências")).toBeTruthy();
    expect(within(table).getByText("3 dias")).toBeTruthy();
    expect(within(table).getByText(/1 possível/)).toBeTruthy();
    expect(within(table).getByText("Sem horários no arquivo")).toBeTruthy();
    expect(screen.getByText(/ocorrências incluem aulas que listam várias salas/)).toBeTruthy();
    fireEvent.click(within(table).getByRole("button", { name: "Ver grade da sala A-203" }));
    expect(onShowRoom).toHaveBeenCalledWith("R2");
  });

  test("avisa quando o detalhamento de sobreposições foi truncado", () => {
    render(
      <ImportRoomsOverview rooms={rooms} overlaps={[overlap]} truncated onShowRoom={() => {}} />,
    );
    expect(screen.getByRole("status").textContent).toContain(
      "totais por sala podem estar parciais",
    );
  });
});
