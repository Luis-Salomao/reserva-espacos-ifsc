import { describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { RoomsFilters, type RoomsFiltersProps } from "#/components/rooms/rooms-filters";
import type { RoomFilter } from "#/domain/room-filter";

const NONE: RoomFilter = {
  blocks: [],
  floors: [],
  minCapacity: null,
  query: "",
  onlyFree: false,
  window: { start: "14:00", end: "16:00" },
};

function renderFilters(over: Partial<RoomsFiltersProps> = {}) {
  const onChange = mock((_filter: RoomFilter) => {});
  const props: RoomsFiltersProps = {
    blocks: ["A", "B", "Outros"],
    floors: [1, 2],
    filter: NONE,
    total: 21,
    shown: 21,
    hiddenNoCapacity: 0,
    view: "colunas",
    onChange,
    ...over,
  };
  const view = render(<RoomsFilters {...props} />);
  return { ...view, onChange, props };
}

const lastFilter = (onChange: ReturnType<typeof mock>) =>
  onChange.mock.calls.at(-1)?.[0] as RoomFilter | undefined;

async function openFilters(): Promise<HTMLElement> {
  fireEvent.click(screen.getByRole("button", { name: /^Filtros/ }));
  return screen.findByRole("dialog", { name: "Filtros" });
}

const absent = (element: Element | null) => element === null;

describe("RoomsFilters", () => {
  test("sem abrir 'Filtros', só a busca aparece em 'Colunas'", () => {
    renderFilters();
    expect(absent(screen.queryByLabelText("Buscar sala"))).toBe(false);
    expect(absent(screen.queryByLabelText("Capacidade mínima"))).toBe(true);
    expect(absent(screen.queryByRole("switch", { name: "Só livres" }))).toBe(true);
    expect(absent(screen.queryByRole("button", { name: "Bloco A" }))).toBe(true);
    expect(absent(screen.queryByLabelText("Início"))).toBe(true);
  });

  test("na visão 'Livres', a janela fica visível ao lado da busca e fora de 'Filtros'", async () => {
    renderFilters({ view: "livres" });
    expect(absent(screen.queryByLabelText("Buscar sala"))).toBe(false);
    expect(absent(screen.queryByLabelText("Início"))).toBe(false);
    expect(absent(screen.queryByLabelText("Fim"))).toBe(false);
    expect(absent(screen.queryByLabelText("Capacidade mínima"))).toBe(true);
    const panel = await openFilters();
    expect(absent(within(panel).queryByLabelText("Início"))).toBe(true);
  });

  test("abrir 'Filtros' mostra bloco, capacidade e 'Só livres'; em 'Colunas', também a janela", async () => {
    renderFilters();
    const panel = await openFilters();
    expect(absent(within(panel).queryByRole("button", { name: "Bloco A" }))).toBe(false);
    expect(absent(within(panel).queryByLabelText("Capacidade mínima"))).toBe(false);
    expect(absent(within(panel).queryByRole("switch", { name: "Só livres" }))).toBe(false);
    expect(absent(within(panel).queryByLabelText("Início"))).toBe(false);
    expect(absent(within(panel).queryByLabelText("Buscar sala"))).toBe(true);
  });

  test("o botão mostra 'Filtros · 2' com dois filtros escondidos ativos", () => {
    renderFilters({ filter: { ...NONE, blocks: ["A"], minCapacity: 30, query: "lab" } });
    expect(screen.getByRole("button", { name: "Filtros · 2" })).toBeDefined();
  });

  test("sem filtro escondido ativo, o botão é só 'Filtros' (a busca visível não conta)", () => {
    renderFilters({ filter: { ...NONE, query: "lab" } });
    expect(screen.getByRole("button", { name: "Filtros" })).toBeDefined();
  });

  test("na visão geral não há janela nem 'Só livres', e 'Só livres' não conta", async () => {
    renderFilters({ view: "geral", filter: { ...NONE, onlyFree: true, blocks: ["B"] } });
    expect(absent(screen.queryByLabelText("Início"))).toBe(true);
    expect(screen.getByRole("button", { name: "Filtros · 1" })).toBeDefined();
    const panel = await openFilters();
    expect(absent(within(panel).queryByRole("switch", { name: "Só livres" }))).toBe(true);
    expect(absent(within(panel).queryByLabelText("Início"))).toBe(true);
    expect(absent(within(panel).queryByLabelText("Capacidade mínima"))).toBe(false);
    expect(absent(within(panel).queryByRole("button", { name: "Bloco A" }))).toBe(false);
  });

  test("chips de bloco ligam e desligam blocos, inclusive 'Outros espaços'", async () => {
    const { onChange, rerender, props } = renderFilters();
    let panel = await openFilters();
    const blockA = within(panel).getByRole("button", { name: "Bloco A" });
    expect(blockA.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(blockA);
    expect(lastFilter(onChange)).toEqual({ ...NONE, blocks: ["A"] });

    rerender(<RoomsFilters {...props} filter={{ ...NONE, blocks: ["A"] }} />);
    panel = screen.getByRole("dialog", { name: "Filtros" });
    expect(
      within(panel).getByRole("button", { name: "Bloco A" }).getAttribute("aria-pressed"),
    ).toBe("true");
    fireEvent.click(within(panel).getByRole("button", { name: "Outros espaços" }));
    expect(lastFilter(onChange)).toEqual({ ...NONE, blocks: ["A", "Outros"] });
    fireEvent.click(within(panel).getByRole("button", { name: "Bloco A" }));
    expect(lastFilter(onChange)).toEqual({ ...NONE, blocks: [] });
  });

  test("chips de andar ficam em 'Filtros' e ligam e desligam andares", async () => {
    const { onChange, rerender, props } = renderFilters();
    expect(absent(screen.queryByRole("button", { name: "Andar 1" }))).toBe(true);
    let panel = await openFilters();
    expect(
      within(panel)
        .getAllByRole("button", { name: /^Andar/ })
        .map((chip) => [chip.textContent, chip.getAttribute("aria-pressed")]),
    ).toEqual([
      ["Andar 1", "false"],
      ["Andar 2", "false"],
    ]);
    fireEvent.click(within(panel).getByRole("button", { name: "Andar 2" }));
    expect(lastFilter(onChange)).toEqual({ ...NONE, floors: [2] });

    rerender(<RoomsFilters {...props} filter={{ ...NONE, floors: [2] }} />);
    panel = screen.getByRole("dialog", { name: "Filtros" });
    expect(
      within(panel).getByRole("button", { name: "Andar 2" }).getAttribute("aria-pressed"),
    ).toBe("true");
    fireEvent.click(within(panel).getByRole("button", { name: "Andar 1" }));
    expect(lastFilter(onChange)).toEqual({ ...NONE, floors: [2, 1] });
    fireEvent.click(within(panel).getByRole("button", { name: "Andar 2" }));
    expect(lastFilter(onChange)).toEqual({ ...NONE, floors: [] });
  });

  test("andar escolhido entra na contagem 'Filtros · n'; andar sem sala não conta", () => {
    renderFilters({ filter: { ...NONE, floors: [2], blocks: ["A"] } });
    expect(screen.getByRole("button", { name: "Filtros · 2" })).toBeDefined();
    renderFilters({ filter: { ...NONE, floors: [7] } });
    expect(screen.getAllByRole("button", { name: /^Filtros/ }).at(-1)?.textContent).toBe("Filtros");
  });

  test("capacidade mínima: inteiro de 1 a 999, vazio ou inválido limpa o filtro", async () => {
    const { onChange } = renderFilters();
    const input = within(await openFilters()).getByLabelText("Capacidade mínima");
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

  test("'Só livres' liga o filtro de disponibilidade", async () => {
    const { onChange } = renderFilters();
    fireEvent.click(within(await openFilters()).getByRole("switch", { name: "Só livres" }));
    expect(lastFilter(onChange)).toEqual({ ...NONE, onlyFree: true });
  });

  test("início e fim mudam a janela na visão 'Livres'", () => {
    const { onChange } = renderFilters({ view: "livres" });
    fireEvent.change(screen.getByLabelText("Início"), { target: { value: "15:00" } });
    expect(lastFilter(onChange)).toEqual({ ...NONE, window: { start: "15:00", end: "16:00" } });
    fireEvent.change(screen.getByLabelText("Fim"), { target: { value: "17:30" } });
    expect(lastFilter(onChange)).toEqual({ ...NONE, window: { start: "14:00", end: "17:30" } });
  });

  test("em 'Colunas', a janela dentro de 'Filtros' também muda o filtro", async () => {
    const { onChange } = renderFilters();
    const panel = await openFilters();
    fireEvent.change(within(panel).getByLabelText("Início"), { target: { value: "15:00" } });
    expect(lastFilter(onChange)).toEqual({ ...NONE, window: { start: "15:00", end: "16:00" } });
  });

  test("fim antes ou igual ao início mostra o erro da janela", () => {
    renderFilters({
      view: "livres",
      filter: { ...NONE, window: { start: "16:00", end: "15:00" } },
    });
    expect(screen.getByRole("alert").textContent).toBe("O fim precisa ser depois do início");
    expect(screen.getByLabelText("Fim").getAttribute("aria-invalid")).toBe("true");
  });

  test("janela válida não mostra erro", () => {
    renderFilters({ view: "livres" });
    expect(absent(screen.queryByText("O fim precisa ser depois do início"))).toBe(true);
  });

  test("mostra 'X de N salas' e o aviso das salas sem capacidade", () => {
    renderFilters({ shown: 3, hiddenNoCapacity: 18 });
    expect(screen.getByText("3 de 21 salas")).toBeDefined();
    expect(screen.getByText("18 salas sem capacidade cadastrada ficaram de fora")).toBeDefined();
  });

  test("sem salas escondidas por capacidade, sem aviso", () => {
    renderFilters();
    expect(absent(screen.queryByText(/sem capacidade cadastrada/))).toBe(true);
  });
});
