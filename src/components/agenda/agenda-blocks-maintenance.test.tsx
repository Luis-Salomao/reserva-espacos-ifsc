import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { makeScale, OccupationCard } from "./agenda-blocks";
import type { PositionedEvent } from "./layout-helpers";

function makeEvent(title: string): PositionedEvent {
  return {
    id: "1",
    date: "2026-11-10",
    start: "08:00",
    end: "09:50",
    title,
    source: "manual",
    status: "ativa",
    person: null,
    mine: false,
    canCancel: false,
    startMinutes: 480,
    endMinutes: 590,
    lane: 0,
    lanes: 1,
    isConflict: false,
  };
}

const scale = makeScale("06:00", "23:00", 0.9);

describe("OccupationCard — manutenção", () => {
  test("título de manutenção mostra o ícone, a etiqueta e esconde o prefixo", () => {
    render(<OccupationCard ev={makeEvent("Manutenção: Troca de lâmpada")} scale={scale} />);
    expect(screen.getByText("Troca de lâmpada")).toBeDefined();
    expect(screen.queryByText(/^Manutenção: /)).toBeNull();
    expect(screen.getByText("Manutenção")).toBeDefined();
  });

  test("título comum não mostra a etiqueta de manutenção", () => {
    render(<OccupationCard ev={makeEvent("Reunião pedagógica")} scale={scale} />);
    expect(screen.getByText("Reunião pedagógica")).toBeDefined();
    expect(screen.queryByText("Manutenção")).toBeNull();
  });
});
