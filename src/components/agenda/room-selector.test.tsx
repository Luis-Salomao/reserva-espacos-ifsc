import { describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { RoomSelector } from "./room-selector";

const spaces = [
  { id: "a", name: "A-202", capacity: 30 },
  { id: "lab", name: "Lab. A102", capacity: null },
  { id: "b", name: "B-103", capacity: 20 },
  { id: "other", name: "Auditório", capacity: null },
];

describe("Seletor agrupado de salas", () => {
  test("abre como modal e permite fechar sem trocar a sala", () => {
    const select = mock();
    render(
      <RoomSelector spaces={spaces} selectedSpaceId="a" onSelectSpace={select} variant="chips" />,
    );
    const trigger = screen.getByRole("button", { name: "Escolher sala: A-202" });
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog", { name: "Escolher sala" })).toBeDefined();
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Fechar seletor de salas");
    fireEvent.click(screen.getByRole("button", { name: "Fechar seletor de salas" }));
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(select).not.toHaveBeenCalled();
  });
  test("agrupa códigos por bloco e pesquisa sem diferenciar acentos", () => {
    render(
      <RoomSelector spaces={spaces} selectedSpaceId="a" onSelectSpace={() => {}} variant="chips" />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Escolher sala: A-202" }));
    const block = screen.getByRole("group", { name: /Bloco A/ });
    expect(within(block).getByRole("button", { name: /Lab. A102/ })).toBeDefined();
    expect(
      within(within(block).getByRole("group", { name: /Andar 1/ })).getByRole("button", {
        name: /Lab. A102/,
      }),
    ).toBeDefined();
    expect(
      within(within(block).getByRole("group", { name: /Andar 2/ })).getByRole("button", {
        name: /A-202/,
      }),
    ).toBeDefined();
    expect(screen.getByRole("group", { name: /Bloco B/ })).toBeDefined();
    fireEvent.change(screen.getByRole("textbox", { name: "Buscar sala ou bloco" }), {
      target: { value: "auditorio" },
    });
    expect(screen.getByRole("button", { name: /^Auditório/ })).toBeDefined();
    expect(screen.queryByRole("group", { name: /Bloco A/ }) === null).toBe(true);
  });

  test("seleciona uma sala e fecha o painel; informa busca vazia", () => {
    const select = mock();
    render(
      <RoomSelector
        spaces={spaces}
        selectedSpaceId="a"
        onSelectSpace={select}
        variant="vertical"
      />,
    );
    const trigger = screen.getByRole("button", { name: "Escolher sala: A-202" });
    fireEvent.click(trigger);
    fireEvent.change(screen.getByRole("textbox", { name: "Buscar sala ou bloco" }), {
      target: { value: "inexistente" },
    });
    expect(screen.getByText("Nenhuma sala encontrada.")).toBeDefined();
    fireEvent.change(screen.getByRole("textbox", { name: "Buscar sala ou bloco" }), {
      target: { value: "bloco b" },
    });
    fireEvent.click(screen.getByRole("button", { name: /B-103/ }));
    expect(select).toHaveBeenCalledWith("b");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });
  test("atalho para todas as salas só aparece quando há destino e fecha o modal", () => {
    const seeAll = mock();
    const { unmount } = render(
      <RoomSelector spaces={spaces} selectedSpaceId="a" onSelectSpace={() => {}} variant="chips" />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Escolher sala: A-202" }));
    expect(screen.queryByRole("button", { name: /Ver todas as salas/ })).toBeNull();
    unmount();
    render(
      <RoomSelector
        spaces={spaces}
        selectedSpaceId="a"
        onSelectSpace={() => {}}
        variant="chips"
        onSeeAllRooms={seeAll}
      />,
    );
    const trigger = screen.getByRole("button", { name: "Escolher sala: A-202" });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: /Ver todas as salas/ }));
    expect(seeAll).toHaveBeenCalledTimes(1);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  test("mostra os equipamentos da sala e só as observações quando pedido", () => {
    const equipped = [
      {
        id: "a",
        name: "A-202",
        capacity: 30,
        equipment: { items: { projetor: 1 }, notes: "Lousa digital" },
      },
    ];
    const { unmount } = render(
      <RoomSelector
        spaces={equipped}
        selectedSpaceId="a"
        onSelectSpace={() => {}}
        variant="chips"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Escolher sala: A-202" }));
    expect(screen.getByRole("list", { name: "Equipamentos" })).toBeDefined();
    expect(screen.getByText("Projetor")).toBeDefined();
    expect(screen.queryByText("Lousa digital") === null).toBe(true);
    unmount();
    render(
      <RoomSelector
        spaces={equipped}
        selectedSpaceId="a"
        onSelectSpace={() => {}}
        variant="chips"
        showNotes
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Escolher sala: A-202" }));
    expect(screen.getByText("Lousa digital")).toBeDefined();
  });
});
