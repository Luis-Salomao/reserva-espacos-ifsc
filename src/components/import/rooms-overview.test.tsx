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
  test("resume e prioriza todas as salas, com contagem clara e detalhes inline", () => {
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
    expect(screen.getAllByRole("row")[1]?.textContent).toContain("A-202");
    expect(screen.getByText(/ocorrências incluem aulas que listam várias salas/)).toBeTruthy();

    const roomRow = screen.getAllByRole("row").find((row) => row.textContent?.includes("A-202"));
    expect(roomRow).toBeTruthy();
    const button = within(roomRow as HTMLElement).getByRole("button", {
      name: /Conferir horários de A-202/,
    });
    fireEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("region", { name: /Horários de A-202/ })).toBeTruthy();
    expect(screen.getAllByText("Mat").length).toBeGreaterThan(0);
  });

  test("avisa quando o detalhamento de sobreposições foi truncado", () => {
    render(<ImportRoomsOverview rooms={rooms} overlaps={[overlap]} truncated periods={periods} />);
    expect(screen.getByRole("status").textContent).toContain(
      "totais por sala podem estar parciais",
    );
  });
});

