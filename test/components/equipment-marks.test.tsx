import { describe, expect, test } from "bun:test";
import { render, screen, within } from "@testing-library/react";
import { EquipmentMarks } from "#/components/equipment-marks";

describe("EquipmentMarks", () => {
  test("sem cadastro, os três tipos dizem que não foi informado", () => {
    render(<EquipmentMarks />);
    const list = screen.getByRole("group", { name: "Equipamentos" });
    expect(
      [
        "Projetor não informado",
        "Computadores não informados",
        "Aparelho de som não informado",
      ].map((text) => within(list).getByText(text).textContent),
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
    const list = screen.getByRole("group", { name: "Equipamentos" });
    expect(within(list).getByText("Projetor")).toBeDefined();
    expect(within(list).getByText("Sem computadores")).toBeDefined();
    expect(within(list).getByText("Aparelho de som não informado")).toBeDefined();
    expect(screen.queryByText("Lousa digital") === null).toBe(true);

    rerender(<EquipmentMarks equipment={equipment} showNotes />);
    expect(screen.getByText("Lousa digital")).toBeDefined();
  });

  test("tem = verde do IFSC; não tem = ícone cortado; não informado = tracejado", () => {
    const { container } = render(
      <EquipmentMarks equipment={{ items: { projetor: 1, computadores: 0 }, notes: null }} />,
    );
    const marca = (texto: string) => {
      const marcaEl = within(screen.getByRole("group", { name: "Equipamentos" }))
        .getByText(texto)
        .closest("[data-estado]");
      if (marcaEl === null) throw new Error(`sem data-estado: ${texto}`);
      return marcaEl;
    };

    const tem = marca("Projetor");
    expect(tem.getAttribute("data-estado")).toBe("tem");
    expect(tem.className).toContain("text-(--accent-text)");
    expect(tem.querySelector("[data-corte]") === null).toBe(true);

    const sem = marca("Sem computadores");
    expect(sem.getAttribute("data-estado")).toBe("sem");
    expect(sem.querySelector("[data-corte]") === null).toBe(false);

    const desconhecido = marca("Aparelho de som não informado");
    expect(desconhecido.getAttribute("data-estado")).toBe("nao-informado");
    expect(desconhecido.className).toContain("border-dashed");
    // Risco nos dois estados sem equipamento confirmado, com cores distintas.
    expect(sem.querySelector("[data-corte='sem']")?.className).toContain("bg-destructive");
    const riscoCinza = desconhecido.querySelector("[data-corte='nao-informado']");
    expect(riscoCinza?.className).toContain("bg-muted-foreground");
    expect(riscoCinza?.className).not.toContain("bg-destructive");
    expect(container.querySelectorAll("[data-corte]").length).toBe(2);
  });
});
