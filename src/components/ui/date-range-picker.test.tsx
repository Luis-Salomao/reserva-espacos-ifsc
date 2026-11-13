import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { DateRangePicker, formatRangeLabel } from "./date-range-picker";

afterEach(cleanup);

function setViewportWidth(width: number) {
  window.matchMedia = (query: string) =>
    ({
      matches:
        width >= Number(query.match(/min-width:\s*(\d+)px/)?.[1] ?? Number.POSITIVE_INFINITY),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true,
    }) as unknown as MediaQueryList;
}

beforeEach(() => setViewportWidth(1280));

function Harness({
  from = "2026-11-12",
  to = "2026-11-18",
  today,
  onRange,
}: {
  from?: string;
  to?: string;
  today?: string;
  onRange?: (range: { from: string; to: string }) => void;
}) {
  const [range, setRange] = useState({ from, to });
  return (
    <DateRangePicker
      id="r"
      from={range.from}
      to={range.to}
      {...(today === undefined ? {} : { today })}
      onChange={(next) => {
        setRange(next);
        onRange?.(next);
      }}
    />
  );
}

const trigger = () => screen.getByRole("button", { name: /Intervalo de datas/ });
/** O botão do dia (ignora a repetição de dias de fora do mês). */
async function day(label: RegExp): Promise<HTMLElement> {
  const buttons = await screen.findAllByRole("button", { name: label });
  const found =
    buttons.find((button) => button.closest("td")?.getAttribute("data-outside") !== "true") ??
    buttons[0];
  if (found === undefined) throw new Error(`Dia não encontrado: ${label}`);
  return found;
}

describe("formatRangeLabel", () => {
  test("mesmo ano mostra o ano só no fim; anos diferentes mostram os dois; um dia só vira data", () => {
    expect(formatRangeLabel("2026-11-12", "2026-11-18")).toBe("12/11 – 18/11/2026");
    expect(formatRangeLabel("2026-12-28", "2027-01-03")).toBe("28/12/2026 – 03/01/2027");
    expect(formatRangeLabel("2026-11-12", "2026-11-12")).toBe("12/11/2026");
  });
});

describe("DateRangePicker", () => {
  test("o botão tem rótulo 'Intervalo de datas' e mostra o intervalo", () => {
    render(<Harness />);
    expect(trigger().tagName).toBe("BUTTON");
    expect(trigger().getAttribute("aria-label")).toBe("Intervalo de datas: 12/11 – 18/11/2026");
    expect(trigger().textContent).toContain("12/11 – 18/11/2026");
  });

  test("com datas inválidas mostra o texto de seleção", () => {
    render(<Harness from="" to="" />);
    expect(trigger().textContent).toContain("Selecionar intervalo");
  });

  test("no computador mostra dois meses lado a lado; no celular, um", async () => {
    render(<Harness />);
    fireEvent.click(trigger());
    await screen.findAllByRole("grid");
    expect(screen.getAllByRole("grid")).toHaveLength(2);
    cleanup();
    setViewportWidth(390);
    render(<Harness />);
    fireEvent.click(trigger());
    await screen.findAllByRole("grid");
    expect(screen.getAllByRole("grid")).toHaveLength(1);
  });

  test("a semana começa na segunda-feira, em português", async () => {
    render(<Harness />);
    fireEvent.click(trigger());
    await screen.findAllByRole("grid");
    const headers = Array.from(document.querySelectorAll(".rdp-weekday")).map((h) =>
      h.textContent?.toLowerCase(),
    );
    expect(headers[0]).toMatch(/^seg/);
    expect(headers[6]).toMatch(/^dom/);
  });

  test("dois cliques escolhem o intervalo, fecham o calendário e chamam onChange", async () => {
    const seen: Array<{ from: string; to: string }> = [];
    render(<Harness onRange={(range) => seen.push(range)} />);
    fireEvent.click(trigger());
    fireEvent.click(await day(/, 20 de novembro de 2026/));
    expect(seen).toEqual([]);
    expect(screen.getByText("Escolha o último dia.")).toBeDefined();
    fireEvent.click(await day(/, 25 de novembro de 2026/));
    await waitFor(() => expect(seen).toEqual([{ from: "2026-11-20", to: "2026-11-25" }]));
    await waitFor(() => expect(screen.queryAllByRole("grid")).toHaveLength(0));
    expect(trigger().textContent).toContain("20/11 – 25/11/2026");
  });

  test("o segundo clique antes do primeiro inverte a ordem; o mesmo dia vale um dia só", async () => {
    const seen: Array<{ from: string; to: string }> = [];
    render(<Harness onRange={(range) => seen.push(range)} />);
    fireEvent.click(trigger());
    fireEvent.click(await day(/, 20 de novembro de 2026/));
    fireEvent.click(await day(/, 16 de novembro de 2026/));
    await waitFor(() => expect(seen).toEqual([{ from: "2026-11-16", to: "2026-11-20" }]));
    fireEvent.click(trigger());
    fireEvent.click(await day(/, 23 de novembro de 2026/));
    fireEvent.click(await day(/, 23 de novembro de 2026/));
    await waitFor(() => expect(seen[1]).toEqual({ from: "2026-11-23", to: "2026-11-23" }));
  });

  test("não deixa passar de 31 dias: o dia 32 depois do início fica desabilitado", async () => {
    render(<Harness from="2026-11-01" to="2026-11-07" />);
    fireEvent.click(trigger());
    fireEvent.click(await day(/, 1 de novembro de 2026/));
    await screen.findByText("Escolha o último dia.");
    // 1/11 + 30 dias = 1/12 (31º dia) vale; 2/12 não.
    const next = screen.getByRole("button", { name: "Ir para o próximo mês" });
    fireEvent.click(next);
    expect(((await day(/, 1 de dezembro de 2026/)) as HTMLButtonElement).disabled).toBe(false);
    expect(((await day(/, 2 de dezembro de 2026/)) as HTMLButtonElement).disabled).toBe(true);
  });

  test("com today, os dias anteriores ficam apagados e anunciados, mas continuam escolhíveis", async () => {
    const seen: Array<{ from: string; to: string }> = [];
    render(<Harness today="2026-11-12" onRange={(range) => seen.push(range)} />);
    fireEvent.click(trigger());
    const past = (await day(/, 10 de novembro de 2026.*já passou/)) as HTMLButtonElement;
    expect(past.disabled).toBe(false);
    expect(past.closest("td")?.className).toContain("text-muted-foreground");
    expect(past.closest("td")?.className).toContain("opacity-60");
    const future = (await day(/, 14 de novembro de 2026/)) as HTMLButtonElement;
    expect(future.getAttribute("aria-label")).not.toContain("já passou");
    fireEvent.click(past);
    fireEvent.click(future);
    await waitFor(() => expect(seen).toEqual([{ from: "2026-11-10", to: "2026-11-14" }]));
  });

  test("fechar sem completar descarta o início escolhido", async () => {
    render(<Harness />);
    fireEvent.click(trigger());
    fireEvent.click(await day(/, 20 de novembro de 2026/));
    fireEvent.keyDown(screen.getAllByRole("grid")[0] as Element, { key: "Escape" });
    await waitFor(() => expect(screen.queryAllByRole("grid")).toHaveLength(0));
    fireEvent.click(trigger());
    await screen.findAllByRole("grid");
    expect(screen.queryByText("Escolha o último dia.")).toBeNull();
  });
});
