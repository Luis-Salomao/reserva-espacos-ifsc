import { describe, expect, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { type PageView, ViewSwitcher } from "#/components/view-switcher";

function ControlledSwitcher({ changes }: { changes: PageView[] }) {
  const [value, setValue] = useState<PageView>("sala");
  return (
    <ViewSwitcher
      value={value}
      onChange={(next) => {
        changes.push(next);
        setValue(next);
      }}
    />
  );
}

describe("ViewSwitcher", () => {
  test("explica a visualização selecionada e atualiza a orientação ao trocar", () => {
    const changes: PageView[] = [];
    render(<ControlledSwitcher changes={changes} />);

    expect(
      screen.getByText("Veja a semana de uma sala. Use o seletor para trocar de ambiente."),
    ).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Salas livres" }));
    expect(changes).toEqual(["livres"]);
    expect(
      screen.getByText("Encontre apenas salas livres no intervalo selecionado."),
    ).toBeDefined();
  });

  test("o botão (i) abre a explicação de todas as visualizações", async () => {
    render(<ControlledSwitcher changes={[]} />);

    fireEvent.click(screen.getByRole("button", { name: "Sobre as visualizações" }));

    const painel = await screen.findByRole("dialog", { name: "Sobre as visualizações" });
    for (const nome of ["Uma sala", "Salas por horário", "Salas livres", "Visão geral"]) {
      expect(painel.textContent).toContain(nome);
    }
    expect(painel.textContent).toContain("Compare a ocupação das salas em um dia.");
    expect(painel.textContent).toContain("Confira a ocupação semanal dos espaços.");
  });
});
