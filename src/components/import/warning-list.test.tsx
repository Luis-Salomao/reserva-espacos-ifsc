import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { WarningList } from "./warning-list";

describe("WarningList", () => {
  test("mostra mensagem, contagem e exemplos de cada grupo", () => {
    render(
      <WarningList
        warnings={[
          {
            code: "missing_period",
            source: "grade",
            section: "cards",
            count: 3,
            examples: ["L1", "L2"],
            message: "Card com período inexistente.",
          },
          {
            code: "x",
            source: "xml",
            section: "lessons",
            count: 1,
            examples: [],
            message: "Seção ausente.",
          },
        ]}
      />,
    );
    expect(screen.getByText(/Card com período inexistente\./)).toBeTruthy();
    expect(screen.getByText(/Grade · cards: 3 ocorrências/)).toBeTruthy();
    expect(screen.getByText("Exemplos: L1, L2")).toBeTruthy();
    expect(screen.getByText(/Arquivo · lessons: 1 ocorrência\)/)).toBeTruthy();
    expect(screen.queryAllByText(/Exemplos:/)).toHaveLength(1);
  });

  test("cada grupo é recolhível (details)", () => {
    const { container } = render(
      <WarningList
        warnings={[
          {
            code: "a",
            source: "xml",
            section: "cards",
            count: 2,
            examples: ["s"],
            message: "Aviso.",
          },
        ]}
      />,
    );
    expect(container.querySelectorAll("details")).toHaveLength(1);
  });

  test("sem avisos mostra mensagem", () => {
    render(<WarningList warnings={[]} />);
    expect(screen.getByText("Nenhum aviso.")).toBeTruthy();
  });
});
