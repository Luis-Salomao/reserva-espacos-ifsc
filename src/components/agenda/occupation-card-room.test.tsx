import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { makeScale, OccupationCard } from "./agenda-blocks";
import type { PositionedEvent } from "./layout-helpers";

function makeEvent(extra: Partial<PositionedEvent> = {}): PositionedEvent {
  return {
    id: "1",
    date: "2026-11-10",
    start: "08:00",
    end: "09:50",
    title: "Reunião",
    source: "manual",
    status: "ativa",
    person: null,
    mine: true,
    canCancel: true,
    startMinutes: 480,
    endMinutes: 590,
    lane: 0,
    lanes: 1,
    isConflict: false,
    ...extra,
  };
}

const scale = makeScale("06:00", "23:00", 0.9);

describe("OccupationCard — sala", () => {
  test("com spaceName mostra a sala e a inclui no aria-label", () => {
    render(<OccupationCard ev={makeEvent({ spaceName: "LAB 106A" })} scale={scale} />);
    expect(screen.getByText("LAB 106A")).toBeDefined();
    expect(screen.getByRole("button").getAttribute("aria-label")).toContain("LAB 106A");
  });

  test("sem spaceName não há linha de sala", () => {
    render(<OccupationCard ev={makeEvent()} scale={scale} />);
    expect(screen.queryByText("LAB 106A")).toBeNull();
  });
});
