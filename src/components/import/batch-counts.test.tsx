import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { EMPTY_COUNTS } from "#/domain/import-batch";
import { BatchCounts } from "./batch-counts";

describe("BatchCounts", () => {
  test("explica zero ocupações aplicáveis e separa a contagem do parser do vínculo local", () => {
    render(
      <BatchCounts
        summary={{
          rows: 195,
          counts: { ...EMPTY_COUNTS, nao_aplicavel: 195 },
          notApplicable: { room_unmapped: 155, term_without_dates: 40 },
        }}
      />,
    );

    expect(screen.getByRole("status").textContent).toContain("Nenhuma ocupação pode ser aplicada");
    expect(screen.getByRole("status").textContent).toContain("não confirma, por si só, o vínculo");
    expect(screen.getByText("Sala sem vínculo")).toBeTruthy();
    expect(screen.getByText("Duração sem datas no semestre")).toBeTruthy();
  });

  test("não mostra alerta de zero quando ainda há linhas pendentes", () => {
    render(
      <BatchCounts
        summary={{
          rows: 2,
          counts: { ...EMPTY_COUNTS, pendente: 2 },
          notApplicable: {},
        }}
      />,
    );

    expect(screen.queryByRole("status")).toBeNull();
  });
});
