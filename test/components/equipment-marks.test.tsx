import { describe, expect, test } from "bun:test";
import { render, screen, within } from "@testing-library/react";
import { EquipmentMarks } from "#/components/equipment-marks";

describe("EquipmentMarks", () => {
  test("sem cadastro, os três tipos dizem que não foi informado", () => {
    render(<EquipmentMarks />);
    const list = screen.getByRole("list", { name: "Equipamentos" });
    expect(
      within(list)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual([
      "Projetor não informado",
      "Computadores não informados",
      "Aparelho de som não informado",
    ]);
    expect(screen.queryByText(/Lousa/) === null).toBe(true);
  });

  test("mostra a quantidade e, só com showNotes, as observações", () => {
    const equipment = {
      items: { projetor: 1, computadores: 0 },
      notes: "Lousa digital",
    };
    const { rerender } = render(<EquipmentMarks equipment={equipment} />);
    const list = screen.getByRole("list", { name: "Equipamentos" });
    expect(within(list).getByText("Projetor")).toBeDefined();
    expect(within(list).getByText("Sem computadores")).toBeDefined();
    expect(within(list).getByText("Aparelho de som não informado")).toBeDefined();
    expect(screen.queryByText("Lousa digital") === null).toBe(true);

    rerender(<EquipmentMarks equipment={equipment} showNotes />);
    expect(screen.getByText("Lousa digital")).toBeDefined();
  });
});
