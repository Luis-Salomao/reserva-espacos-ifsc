import { expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { TermsList } from "./terms-list";

test("mostra a frase obrigatória, rótulos, máscaras e contagem", () => {
  render(<TermsList terms={[{ mask: "1100", label: "Semestre 1", slots: 2 }]} />);
  expect(
    screen.getByText("ainda sem datas: serão definidas na configuração do semestre"),
  ).toBeTruthy();
  expect(screen.getByText("Semestre 1")).toBeTruthy();
  expect(screen.getByText("1100")).toBeTruthy();
  expect(screen.getByText(/2 horários/)).toBeTruthy();
});
