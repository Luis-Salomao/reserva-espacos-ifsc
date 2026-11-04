import { describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { RoomsFilters, type RoomsFiltersProps } from "#/components/rooms/rooms-filters";
import type { RoomFilter } from "#/domain/room-filter";

const NONE: RoomFilter = {
  blocks: [],
  minCapacity: null,
  query: "",
  onlyFree: false,
  window: { start: "14:00", end: "16:00" },
};

function renderFilters(over: Partial<RoomsFiltersProps> = {}) {
  const onChange = mock((_filter: RoomFilter) => {});
  const props: RoomsFiltersProps = {
    blocks: ["A", "B", "Outros"],
    filter: NONE,
    total: 21,
    shown: 21,
    hiddenNoCapacity: 0,
    compact: false,
    onChange,
    ...over,
  };
  const view = render(<RoomsFilters {...props} />);
  return { ...view, onChange, props };
}

const lastFilter = (onChange: ReturnType<typeof mock>) =>
  onChange.mock.calls.at(-1)?.[0] as RoomFilter | undefined;

describe("RoomsFilters", () => {
  test("chips de bloco ligam e desligam blocos, inclusive 'Outros espaços'", () => {
    const { onChange, rerender, props } = renderFilters();
    const blockA = screen.getByRole("button", { name: "Bloco A" });
    expect(blockA.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(blockA);
    expect(lastFilter(onChange)).toEqual({ ...NONE, blocks: ["A"] });

    rerender(<RoomsFilters {...props} filter={{ ...NONE, blocks: ["A"] }} />);
    expect(screen.getByRole("button", { name: "Bloco A" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: "Outros espaços" }));
    expect(lastFilter(onChange)).toEqual({ ...NONE, blocks: ["A", "Outros"] });
    fireEvent.click(screen.getByRole("button", { name: "Bloco A" }));
    expect(lastFilter(onChange)).toEqual({ ...NONE, blocks: [] });
  });

  test("capacidade mínima: inteiro de 1 a 999, vazio ou inválido limpa o filtro", () => {
    const { onChange } = renderFilters();
    const input = screen.getByLabelText("Capacidade mínima");
    fireEvent.change(input, { target: { value: "25" } });
    expect(lastFilter(onChange)).toEqual({ ...NONE, minCapacity: 25 });
    fireEvent.change(input, { target: { value: "" } });
    expect(lastFilter(onChange)).toEqual({ ...NONE, minCapacity: null });
    fireEvent.change(input, { target: { value: "0" } });
    expect(lastFilter(onChange)).toEqual({ ...NONE, minCapacity: null });
  });

  test("busca envia o texto digitado", () => {
    const { onChange } = renderFilters();
    fireEvent.change(screen.getByLabelText("Buscar sala"), { target: { value: "auditório" } });
    expect(lastFilter(onChange)).toEqual({ ...NONE, query: "auditório" });
  });

  test("'Só livres' liga o filtro de disponibilidade", () => {
    const { onChange } = renderFilters();
    fireEvent.click(screen.getByRole("switch", { name: "Só livres" }));
    expect(lastFilter(onChange)).toEqual({ ...NONE, onlyFree: true });
  });

  test("início e fim mudam a janela", () => {
    const { onChange } = renderFilters();
    fireEvent.change(screen.getByLabelText("Início"), { target: { value: "15:00" } });
    expect(lastFilter(onChange)).toEqual({ ...NONE, window: { start: "15:00", end: "16:00" } });
    fireEvent.change(screen.getByLabelText("Fim"), { target: { value: "17:30" } });
    expect(lastFilter(onChange)).toEqual({ ...NONE, window: { start: "14:00", end: "17:30" } });
  });

  test("fim antes ou igual ao início mostra o erro da janela", () => {
    renderFilters({ filter: { ...NONE, window: { start: "16:00", end: "15:00" } } });
    expect(screen.getByRole("alert").textContent).toBe("O fim precisa ser depois do início");
    expect(screen.getByLabelText("Fim").getAttribute("aria-invalid")).toBe("true");
  });

  test("janela válida não mostra erro", () => {
    renderFilters();
    expect(screen.queryByText("O fim precisa ser depois do início")).toBeNull();
  });

  test("mostra 'X de N salas' e o aviso das salas sem capacidade", () => {
    renderFilters({ shown: 3, hiddenNoCapacity: 18 });
    expect(screen.getByText("3 de 21 salas")).toBeDefined();
    expect(screen.getByText("18 salas sem capacidade cadastrada ficaram de fora")).toBeDefined();
  });

  test("sem salas escondidas por capacidade, sem aviso", () => {
    renderFilters();
    expect(screen.queryByText(/sem capacidade cadastrada/)).toBeNull();
  });

  test("no celular, os filtros ficam no botão 'Filtros (n)' com o número de filtros ativos", async () => {
    const { onChange } = renderFilters({
      compact: true,
      filter: { ...NONE, blocks: ["A", "B"], onlyFree: true, query: "lab" },
    });
    expect(screen.queryByRole("button", { name: "Bloco A" })).toBeNull();
    expect(screen.getByLabelText("Início")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Filtros (3)" }));
    const panel = await screen.findByRole("dialog", { name: "Filtros" });
    fireEvent.click(within(panel).getByRole("button", { name: "Bloco B" }));
    expect(lastFilter(onChange)?.blocks).toEqual(["A"]);
  });

  test("no celular, sem filtros ativos o botão é só 'Filtros'", () => {
    renderFilters({ compact: true });
    expect(screen.getByRole("button", { name: "Filtros" })).toBeDefined();
  });
});
