import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { legendEntryOf } from "#/domain/occupation-tone";
import { makeScale, OccupationCard } from "./agenda-blocks";
import type { PositionedEvent } from "./layout-helpers";

function makeEvent(title: string): PositionedEvent {
  return {
    id: "1",
    date: "2026-11-10",
    start: "08:00",
    end: "09:50",
    title,
    source: "manual",
    status: "ativa",
    person: null,
    mine: false,
    canCancel: false,
    startMinutes: 480,
    endMinutes: 590,
    lane: 0,
    lanes: 1,
    isConflict: false,
  };
}

const scale = makeScale("06:00", "23:00", 0.9);

describe("OccupationCard — manutenção", () => {
  test("título de manutenção mostra o ícone, a etiqueta e esconde o prefixo", () => {
    render(<OccupationCard ev={makeEvent("Manutenção: Troca de lâmpada")} scale={scale} />);
    expect(screen.getByText("Troca de lâmpada")).toBeDefined();
    expect(screen.queryByText(/^Manutenção: /)).toBeNull();
    expect(screen.getByText("Manutenção")).toBeDefined();
  });

  test("título comum não mostra a etiqueta de manutenção", () => {
    render(<OccupationCard ev={makeEvent("Reunião pedagógica")} scale={scale} />);
    expect(screen.getByText("Reunião pedagógica")).toBeDefined();
    expect(screen.queryByText("Manutenção")).toBeNull();
  });
});

describe("OccupationCard — identificação da disciplina", () => {
  test("sigla e título acessível permanecem iguais entre estados e em cartões estreitos", () => {
    const ev = { ...makeEvent("ALG — T1A"), source: "import" as const, lanes: 4 };
    const { container, rerender } = render(<OccupationCard ev={ev} scale={scale} />);
    expect(screen.getByText("ALG").getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByRole("button", { name: /ALG — T1A.*Aula importada/ })).toBeDefined();
    expect(container.querySelector("button")?.className).toContain("var(--tone-light)");
    expect(container.querySelector("button")?.className).not.toContain("bg-occ-imported");
    rerender(<OccupationCard ev={{ ...ev, isConflict: true }} scale={scale} />);
    expect(screen.getByText("ALG")).toBeDefined();
    expect(screen.getByRole("button", { name: /ALG — T1A.*Conflito/ })).toBeDefined();
    expect(container.querySelector("button")?.className).toContain("bg-occ-conflict");
  });

  test("aula importada usa a cor da disciplina (mesma da Visão geral); reserva manual, a neutra", () => {
    const ev = { ...makeEvent("ALG — T1A"), source: "import" as const };
    const { container, rerender } = render(<OccupationCard ev={ev} scale={scale} />);
    const tone = legendEntryOf(ev).tone;
    const button = container.querySelector("button") as HTMLElement;
    expect(button.style.getPropertyValue("--tone-light")).toBe(tone.light);
    expect(button.style.getPropertyValue("--tone-dark")).toBe(tone.dark);
    rerender(<OccupationCard ev={makeEvent("Reunião pedagógica")} scale={scale} />);
    const manual = container.querySelector("button") as HTMLElement;
    expect(manual.className).toContain("bg-occ-booked");
    expect(manual.style.getPropertyValue("--tone-light")).toBe("");
  });

  test("reservas manuais não recebem uma sigla de disciplina", () => {
    render(<OccupationCard ev={makeEvent("Reunião pedagógica")} scale={scale} />);
    expect(screen.queryByText("RP")).toBeNull();
  });
});
