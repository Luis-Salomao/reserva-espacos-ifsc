import { describe, expect, test } from "bun:test";
import { render } from "@testing-library/react";
import type { Space } from "#/domain/space";
import { SpaceDetails, SpaceDetailsLegend } from "./space-details";

function space(overrides: Partial<Space> = {}): Space {
  return {
    id: "s1",
    name: "Sala 1",
    capacity: null,
    ...overrides,
  };
}

describe("SpaceDetails", () => {
  test("espaço completo mostra capacidade, equipamentos e computadores", () => {
    const { getByText, getAllByText } = render(
      <SpaceDetails
        space={space({
          capacity: 40,
          equipment: {
            items: { projetor: 1, som: 1, computadores: 20 },
            notes: "Chave na secretaria.",
            computersInMaintenance: 3,
          },
        })}
      />,
    );
    expect(getByText("Informações cadastradas")).toBeTruthy();
    expect(getByText("40 pessoas")).toBeTruthy();
    expect(getAllByText("Sim").length).toBe(2);
    expect(getByText("20")).toBeTruthy();
    expect(getByText("3 em manutenção")).toBeTruthy();
    expect(getByText("17 disponíveis")).toBeTruthy();
    expect(getByText("Chave na secretaria.")).toBeTruthy();
    expect(
      getByText("Dados do cadastro; não garantem que os equipamentos estão funcionando."),
    ).toBeTruthy();
  });

  test("espaço sem nenhum dado mostra não informado em tudo", () => {
    const { getAllByText } = render(<SpaceDetails space={space()} />);
    const values = getAllByText("Não informado");
    expect(values.length).toBeGreaterThan(0);
    expect(values[0]?.closest("dd")?.className).toContain("whitespace-nowrap");
  });

  test("0 em manutenção mostra todos disponíveis no cadastro", () => {
    const { getByText } = render(
      <SpaceDetails
        space={space({
          equipment: {
            items: { computadores: 10 },
            notes: null,
            computersInMaintenance: 0,
          },
        })}
      />,
    );
    expect(getByText("Todos disponíveis no cadastro")).toBeTruthy();
  });

  test("computersInMaintenance null mostra não informado", () => {
    const { getAllByText } = render(
      <SpaceDetails
        space={space({
          equipment: {
            items: { computadores: 10 },
            notes: null,
            computersInMaintenance: null,
          },
        })}
      />,
    );
    expect(getAllByText("Não informado").length).toBeGreaterThan(0);
  });

  test("variante compact mostra ícone, total e badge acessível de manutenção", () => {
    const { getByLabelText, getByText } = render(
      <SpaceDetails
        compact
        space={space({
          equipment: {
            items: { computadores: 20 },
            notes: null,
            computersInMaintenance: 3,
          },
        })}
      />,
    );
    expect(getByText("20")).toBeTruthy();
    expect(getByLabelText("3 computadores em manutenção")).toBeTruthy();
  });

  test("variante compact sem manutenção não mostra badge", () => {
    const { queryByLabelText } = render(
      <SpaceDetails
        compact
        space={space({
          equipment: {
            items: { computadores: 20 },
            notes: null,
            computersInMaintenance: 0,
          },
        })}
      />,
    );
    expect(queryByLabelText(/em manutenção/)).toBeNull();
  });
});

describe("SpaceDetailsLegend", () => {
  test("mostra os três itens de legenda com texto", () => {
    const { getByText, getAllByText } = render(<SpaceDetailsLegend />);
    expect(getByText(/computadores cadastrados/i)).toBeTruthy();
    expect(getAllByText(/em manutenção/i).length).toBeGreaterThan(0);
    expect(getByText(/sem cadastro/i)).toBeTruthy();
  });
});
