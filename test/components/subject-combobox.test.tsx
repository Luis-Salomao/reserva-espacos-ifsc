import { describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { SubjectCombobox, type SubjectsLoad } from "#/components/agenda/subject-combobox";

const GROUPS = {
  mine: ["Álgebra — 1A", "Cálculo — 2B"],
  all: ["Química — 3C"],
};

function loadOf(groups: { mine: string[]; all: string[] } = GROUPS): SubjectsLoad {
  return mock(async () => ({ ok: true as const, data: groups }));
}

function Field({
  date = "2026-11-10",
  load,
  onSubmit,
}: {
  date?: string;
  load: SubjectsLoad;
  onSubmit?: () => void;
}) {
  const [value, setValue] = useState("");
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit?.();
      }}
    >
      <label htmlFor="materia">Matéria ou título</label>
      <SubjectCombobox id="materia" value={value} onChange={setValue} date={date} loadFn={load} />
      <button type="submit">Enviar</button>
    </form>
  );
}

const box = () => screen.getByRole("combobox", { name: "Matéria ou título" });

async function openWith(load: SubjectsLoad, date = "2026-11-10") {
  const view = render(<Field date={date} load={load} />);
  await waitFor(() => expect(load).toHaveBeenCalled());
  fireEvent.focus(box());
  return view;
}

describe("SubjectCombobox", () => {
  test("mostra os grupos nessa ordem e esconde Minhas quando não há", async () => {
    const view = await openWith(loadOf());
    const mine = screen.getByRole("group", { name: "Minhas matérias" });
    const all = screen.getByRole("group", { name: "Todas as matérias" });
    expect(mine.compareDocumentPosition(all) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(mine.textContent).toContain("Álgebra — 1A");
    expect(all.textContent).toContain("Química — 3C");
    view.unmount();
    const emptyMine = loadOf({ mine: [], all: ["Química — 3C"] });
    render(<Field load={emptyMine} />);
    await waitFor(() => expect(emptyMine).toHaveBeenCalled());
    fireEvent.focus(box());
    expect(screen.queryByRole("group", { name: "Minhas matérias" }) === null).toBe(true);
    expect(screen.getByRole("group", { name: "Todas as matérias" })).toBeDefined();
  });

  test("filtra sem acento e a opção livre só aparece fora de coincidência exata", async () => {
    await openWith(loadOf());
    fireEvent.change(box(), { target: { value: "calculo" } });
    expect(screen.getByRole("option", { name: "Cálculo — 2B" })).toBeDefined();
    expect(screen.queryByRole("option", { name: "Química — 3C" }) === null).toBe(true);
    expect(screen.getByRole("option", { name: "Usar “calculo” como título" })).toBeDefined();

    fireEvent.change(box(), { target: { value: "  CÁLCULO — 2b  " } });
    expect(screen.queryByRole("option", { name: /Usar/ }) === null).toBe(true);
  });

  test("escolher um item grava o texto do catálogo; a opção livre grava o texto aparado", async () => {
    await openWith(loadOf());
    fireEvent.change(box(), { target: { value: "alge" } });
    fireEvent.click(screen.getByRole("option", { name: "Álgebra — 1A" }));
    expect((box() as HTMLInputElement).value).toBe("Álgebra — 1A");
    expect(screen.queryByRole("listbox") === null).toBe(true);

    fireEvent.change(box(), { target: { value: "  Reunião de área  " } });
    fireEvent.click(screen.getByRole("option", { name: "Usar “Reunião de área” como título" }));
    expect((box() as HTMLInputElement).value).toBe("Reunião de área");
  });

  test("falha de carga não monta a lista e o campo continua aceitando título", async () => {
    const load = mock<SubjectsLoad>(async () => ({
      ok: false,
      status: 400,
      message: "falhou",
    }));
    render(<Field load={load} />);
    expect(await screen.findByText("Não foi possível carregar as matérias")).toBeDefined();
    expect(screen.queryByRole("listbox") === null).toBe(true);
    fireEvent.change(box(), { target: { value: "Reunião" } });
    expect((box() as HTMLInputElement).value).toBe("Reunião");
    expect(screen.queryByRole("listbox") === null).toBe(true);
  });

  test("setas movem o destaque, Enter escolhe sem enviar e Esc fecha", async () => {
    const submitted = mock();
    const load = loadOf();
    render(<Field load={load} onSubmit={submitted} />);
    await waitFor(() => expect(load).toHaveBeenCalled());
    fireEvent.focus(box());
    fireEvent.keyDown(box(), { key: "ArrowDown" });
    expect(box().getAttribute("aria-activedescendant")).toBe(
      screen.getByRole("option", { name: "Cálculo — 2B" }).id,
    );
    fireEvent.keyDown(box(), { key: "Enter" });
    expect((box() as HTMLInputElement).value).toBe("Cálculo — 2B");
    expect(submitted).not.toHaveBeenCalled();
    expect(screen.queryByRole("listbox") === null).toBe(true);

    fireEvent.focus(box());
    fireEvent.keyDown(box(), { key: "Escape" });
    expect(screen.queryByRole("listbox") === null).toBe(true);
    expect((box() as HTMLInputElement).value).toBe("Cálculo — 2B");
  });

  test("a lista ocupa a largura do campo e cada opção tem alvo de 44 px", async () => {
    await openWith(loadOf());
    const list = screen.getByRole("listbox");
    expect(list.className.split(" ")).toContain("w-full");
    for (const option of screen.getAllByRole("option")) {
      expect(option.className.split(" ")).toContain("min-h-11");
      expect(option.className.split(" ")).toContain("w-full");
    }
  });

  test("pede as matérias da data e de novo quando a data muda", async () => {
    const load = loadOf();
    const { rerender } = render(<Field date="2026-11-10" load={load} />);
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    expect(load).toHaveBeenCalledWith({ data: { date: "2026-11-10" } });
    rerender(<Field date="2026-12-01" load={load} />);
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    expect(load).toHaveBeenLastCalledWith({ data: { date: "2026-12-01" } });
  });
});
