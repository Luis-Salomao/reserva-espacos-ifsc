import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MiniCalendar } from "./mini-calendar";

afterEach(cleanup);

describe("MiniCalendar: dias passados", () => {
  test("dias anteriores a hoje ficam apagados e anunciados, mas continuam selecionáveis", () => {
    const onSelectDate = mock();
    render(
      <MiniCalendar selectedDate="2026-11-12" todayDate="2026-11-12" onSelectDate={onSelectDate} />,
    );
    const past = screen.getByRole("button", { name: "10 de novembro (já passou)" });
    expect(past.className).toContain("opacity-60");
    expect(past.className).toContain("text-muted-foreground");
    fireEvent.click(past);
    expect(onSelectDate).toHaveBeenCalledWith("2026-11-10");
    const today = screen.getByRole("button", { name: "12 de novembro" });
    const future = screen.getByRole("button", { name: "13 de novembro" });
    expect(today.className).not.toContain("opacity-60");
    expect(future.className).not.toContain("opacity-60");
  });

  test("o dia selecionado no passado não perde o destaque", () => {
    render(
      <MiniCalendar selectedDate="2026-11-05" todayDate="2026-11-12" onSelectDate={() => {}} />,
    );
    const selected = screen.getByRole("button", { name: "5 de novembro (já passou)" });
    expect(selected.getAttribute("aria-pressed")).toBe("true");
    expect(selected.className).not.toContain("opacity-60");
  });
});
