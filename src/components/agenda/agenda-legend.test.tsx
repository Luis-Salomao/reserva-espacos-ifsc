import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { AgendaLegend } from "./agenda-legend";

describe("AgendaLegend", () => {
  test("inclui a legenda de manutenção", () => {
    render(<AgendaLegend />);
    expect(screen.getByText("Manutenção (reserva da equipe de manutenção)")).toBeDefined();
  });
});
