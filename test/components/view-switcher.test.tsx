import { describe, expect, test } from "bun:test";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

const NOMES = ["Uma sala", "Salas por horário", "Salas livres", "Visão geral"];

describe("ViewSwitcher", () => {
  test("trocar de aba chama onChange e a ajuda fica no modal (sem texto solto sob as abas)", () => {
    const changes: PageView[] = [];
    render(<ControlledSwitcher changes={changes} />);
    expect(screen.queryByText(/Veja a semana de uma sala/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Salas livres" }));
    expect(changes).toEqual(["livres"]);
  });

  test("os botões formam uma barra de abas legível, com a ativa em destaque", () => {
    render(<ControlledSwitcher changes={[]} />);
    const grupo = screen.getByRole("group", { name: "Visualização" });
    const ativo = within(grupo).getByRole("button", { name: "Uma sala" });
    const inativo = within(grupo).getByRole("button", { name: "Visão geral" });
    expect(ativo.getAttribute("aria-pressed")).toBe("true");
    expect(ativo.className.split(" ")).toContain("bg-primary");
    expect(ativo.className).toContain("min-h-9");
    expect(ativo.className).toContain("text-[13px]");
    expect(inativo.className.split(" ")).not.toContain("bg-primary");
    expect(inativo.className).toContain("hover:bg-");
  });

  test("o botão (i) abre o modal 'Modos de visualização' com os quatro modos", async () => {
    render(<ControlledSwitcher changes={[]} />);

    fireEvent.click(screen.getByRole("button", { name: "Sobre as visualizações" }));

    const modal = await screen.findByRole("dialog", { name: "Modos de visualização" });
    for (const nome of NOMES) {
      expect(within(modal).getByRole("button", { name: new RegExp(nome) })).toBeDefined();
    }
    expect(modal.textContent).toContain("Compare a ocupação das salas em um dia.");
    expect(modal.textContent).toContain("Todas as salas, por dia ou por semana");
    const atual = within(modal).getByRole("button", { name: /Uma sala/ });
    expect(atual.getAttribute("aria-current")).toBe("true");
    const outro = within(modal).getByRole("button", { name: /Visão geral/ });
    expect(outro.hasAttribute("aria-current")).toBe(false);
  });

  test("clicar em um cartão troca a visualização e fecha o modal", async () => {
    const changes: PageView[] = [];
    render(<ControlledSwitcher changes={changes} />);
    fireEvent.click(screen.getByRole("button", { name: "Sobre as visualizações" }));
    const modal = await screen.findByRole("dialog", { name: "Modos de visualização" });

    fireEvent.click(within(modal).getByRole("button", { name: /Salas livres/ }));

    expect(changes).toEqual(["livres"]);
    await waitFor(() => expect(screen.queryByRole("dialog") === null).toBe(true));
  });

  test("o botão Fechar e Esc fecham o modal e o foco volta ao (i)", async () => {
    render(<ControlledSwitcher changes={[]} />);
    const info = screen.getByRole("button", { name: "Sobre as visualizações" });

    fireEvent.click(info);
    const modal = await screen.findByRole("dialog", { name: "Modos de visualização" });
    fireEvent.click(within(modal).getByRole("button", { name: "Fechar" }));
    await waitFor(() => expect(screen.queryByRole("dialog") === null).toBe(true));
    await waitFor(() => expect(document.activeElement).toBe(info));

    fireEvent.click(info);
    const outro = await screen.findByRole("dialog", { name: "Modos de visualização" });
    fireEvent.keyDown(outro, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog") === null).toBe(true));
  });
});
