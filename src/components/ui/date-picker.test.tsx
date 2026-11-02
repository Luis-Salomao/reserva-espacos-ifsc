import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { Label } from "#/components/ui/label";
import { DatePicker, formatIsoDate, parseIsoDate } from "./date-picker";

afterEach(cleanup);

function Harness({ initial = "", onValue }: { initial?: string; onValue?: (v: string) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <div>
      <Label htmlFor="d">Início</Label>
      <DatePicker
        id="d"
        value={value}
        aria-describedby="d-error"
        onChange={(next) => {
          setValue(next);
          onValue?.(next);
        }}
      />
    </div>
  );
}

describe("parseIsoDate / formatIsoDate", () => {
  test("ida e volta sem deslocar o dia (fuso)", () => {
    const date = parseIsoDate("2026-03-01");
    expect(date?.getFullYear()).toBe(2026);
    expect(date?.getMonth()).toBe(2);
    expect(date?.getDate()).toBe(1);
    expect(date && formatIsoDate(date)).toBe("2026-03-01");
  });

  test("rejeita vazio, formato errado e datas inexistentes", () => {
    expect(parseIsoDate("")).toBeUndefined();
    expect(parseIsoDate("01/03/2026")).toBeUndefined();
    expect(parseIsoDate("2026-02-30")).toBeUndefined();
  });
});

describe("DatePicker", () => {
  test("o rótulo se associa ao botão e o valor aparece em dd/mm/aaaa", () => {
    render(<Harness initial="2026-03-09" />);
    const trigger = screen.getByLabelText("Início");
    expect(trigger.tagName).toBe("BUTTON");
    expect(trigger.textContent).toContain("09/03/2026");
    expect(trigger.getAttribute("aria-describedby")).toBe("d-error");
  });

  test("sem valor mostra o texto de seleção", () => {
    render(<Harness />);
    expect(screen.getByLabelText("Início").textContent).toContain("Selecionar data");
  });

  test("escolher um dia devolve AAAA-MM-DD e fecha o calendário", async () => {
    const seen: string[] = [];
    render(<Harness initial="2026-03-09" onValue={(v) => seen.push(v)} />);
    fireEvent.click(screen.getByLabelText("Início"));
    const day = await screen.findByText("15", { selector: "button" });
    fireEvent.click(day);
    await waitFor(() => expect(seen).toEqual(["2026-03-15"]));
    await waitFor(() => expect(screen.queryByRole("grid")).toBeNull());
    expect(screen.getByLabelText("Início").textContent).toContain("15/03/2026");
  });

  test("a semana começa na segunda-feira, em português", async () => {
    render(<Harness initial="2026-03-09" />);
    fireEvent.click(screen.getByLabelText("Início"));
    await screen.findByRole("grid");
    const headers = Array.from(document.querySelectorAll(".rdp-weekday")).map((h) =>
      h.textContent?.toLowerCase(),
    );
    expect(headers[0]).toMatch(/^seg/);
    expect(headers[6]).toMatch(/^dom/);
  });

  test("abre pelo teclado e fecha com Escape devolvendo o foco ao botão", async () => {
    render(<Harness initial="2026-03-09" />);
    const trigger = screen.getByLabelText("Início");
    trigger.focus();
    fireEvent.click(trigger);
    await screen.findByRole("grid");
    fireEvent.keyDown(screen.getByRole("grid"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("grid")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
});
