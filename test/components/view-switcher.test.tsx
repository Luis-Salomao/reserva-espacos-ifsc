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
    fireEvent.click(screen.getByRole("button", { name: "Livres" }));
    expect(changes).toEqual(["livres"]);
    expect(
      screen.getByText("Encontre apenas salas livres no intervalo selecionado."),
    ).toBeDefined();
  });
});
