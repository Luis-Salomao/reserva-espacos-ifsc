import { describe, expect, test } from "bun:test";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { AdminTable, type Column, nextSort, type SortState, sortRows } from "./admin-table";
import { RowActions, rowActionIds, StatusTag } from "./row-actions";

type Row = { id: string; name: string; mail: string };
const rows: Row[] = [
  { id: "1", name: "Carla", mail: "carla@ifsc.edu.br" },
  { id: "2", name: "Ana", mail: "ana@ifsc.edu.br" },
  { id: "3", name: "Bruno", mail: "bruno@ifsc.edu.br" },
];
const columns: Column<Row>[] = [
  { key: "name", header: "Nome", cell: (row) => row.name, sortValue: (row) => row.name },
  { key: "mail", header: "E-mail", cell: (row) => row.mail },
  { key: "acoes", header: "Ações", cell: (row) => <span>{`ações ${row.id}`}</span> },
];

function Harness({ list = rows }: { list?: Row[] }) {
  const [sort, setSort] = useState<SortState | null>(null);
  return (
    <AdminTable
      caption="Pessoas"
      rows={sortRows(list, columns, sort)}
      columns={columns}
      rowKey={(row) => row.id}
      sort={sort}
      onSort={(key) => setSort((current) => nextSort(current, key))}
    />
  );
}

describe("AdminTable", () => {
  test("é uma tabela semântica com legenda, cabeçalhos de coluna e uma linha por item", () => {
    render(<Harness />);
    const table = screen.getByRole("table", { name: "Pessoas" });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((th) => th.textContent),
    ).toEqual(["Nome", "E-mail", "Ações"]);
    for (const th of within(table).getAllByRole("columnheader")) {
      expect(th.getAttribute("scope")).toBe("col");
    }
    const body = within(table).getAllByRole("row").slice(1);
    expect(body).toHaveLength(3);
    expect(within(body[0] as HTMLElement).getByText("Carla")).toBeTruthy();
  });

  test("clicar no cabeçalho ordenável alterna crescente e decrescente e informa aria-sort", () => {
    render(<Harness />);
    const names = () =>
      screen
        .getAllByRole("row")
        .slice(1)
        .map((row) => within(row).getAllByRole("cell")[0]?.textContent);
    const header = () => screen.getByRole("columnheader", { name: /Nome/ });
    expect(header().getAttribute("aria-sort")).toBe("none");
    fireEvent.click(within(header()).getByRole("button"));
    expect(names()).toEqual(["Ana", "Bruno", "Carla"]);
    expect(header().getAttribute("aria-sort")).toBe("ascending");
    fireEvent.click(within(header()).getByRole("button"));
    expect(names()).toEqual(["Carla", "Bruno", "Ana"]);
    expect(header().getAttribute("aria-sort")).toBe("descending");
    expect(screen.getByRole("columnheader", { name: "E-mail" }).getAttribute("aria-sort")).toBe(
      null,
    );
  });

  test("sem sort, a ordem recebida é mantida", () => {
    expect(sortRows(rows, columns, null).map((row) => row.id)).toEqual(["1", "2", "3"]);
    expect(nextSort({ key: "name", direction: "desc" }, "name")).toEqual({
      key: "name",
      direction: "asc",
    });
  });
});

describe("RowActions", () => {
  function renderActions(onEdit = () => {}, onSelect = () => {}) {
    render(
      <RowActions
        rowId="r1"
        name="Ana"
        onEdit={onEdit}
        actions={[
          { label: "Redefinir senha", onSelect },
          { label: "Desativar", onSelect: () => {}, disabled: true },
        ]}
      />,
    );
  }

  function openMenu() {
    const trigger = screen.getByRole("button", { name: "Mais ações de Ana" });
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
    return trigger;
  }

  test("lápis tem nome acessível 'Editar NOME', title e avisa a edição", () => {
    let edits = 0;
    renderActions(() => {
      edits += 1;
    });
    const pencil = screen.getByRole("button", { name: "Editar Ana" });
    expect(pencil.getAttribute("title")).toBe("Editar");
    expect(pencil.id).toBe(rowActionIds("r1").edit);
    fireEvent.click(pencil);
    expect(edits).toBe(1);
  });

  test("menu 'Mais ações' lista as ações e executa a escolhida", async () => {
    let selected = 0;
    renderActions(undefined, () => {
      selected += 1;
    });
    const trigger = openMenu();
    expect(trigger.id).toBe(rowActionIds("r1").more);
    const menu = await screen.findByRole("menu");
    const items = within(menu).getAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual(["Redefinir senha", "Desativar"]);
    expect(items[1]?.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(items[0] as HTMLElement);
    expect(selected).toBe(1);
    await waitFor(() => expect(screen.queryByRole("menu") === null).toBe(true));
  });

  test("sem ações extras não mostra o menu", () => {
    render(<RowActions rowId="r2" name="Bia" onEdit={() => {}} actions={[]} />);
    expect(screen.queryByRole("button", { name: "Mais ações de Bia" }) === null).toBe(true);
  });
});

describe("StatusTag", () => {
  test("mostra o texto como selo neutro", () => {
    render(<StatusTag>Ativa</StatusTag>);
    expect(screen.getByText("Ativa").getAttribute("data-slot")).toBe("tag");
  });
});
