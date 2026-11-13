import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import type { DayAgenda } from "#/application/bookings";
import { makeScale } from "./agenda-blocks";
import { DayColumn } from "./day-column";
import { futureFree } from "./layout-helpers";

afterEach(cleanup);

const FREE = [
  { start: "06:00", end: "08:00" },
  { start: "13:30", end: "18:00" },
];

const day = (date: string, now: string): DayAgenda => ({
  spaceId: "s1",
  date,
  now,
  hours: { opens: "06:00", closes: "23:00" },
  occupations: [],
  free: FREE,
  blocks: [],
});

describe("futureFree", () => {
  test("dia anterior fica sem livre; dia futuro, inteiro; hoje começa no agora", () => {
    expect(futureFree("2026-11-04", FREE, "2026-11-05T10:00")).toEqual([]);
    expect(futureFree("2026-11-06", FREE, "2026-11-05T10:00")).toEqual(FREE);
    expect(futureFree("2026-11-05", FREE, "2026-11-05T10:00")).toEqual([
      { start: "13:30", end: "18:00" },
    ]);
    expect(futureFree("2026-11-05", FREE, "2026-11-05T15:00")).toEqual([
      { start: "15:00", end: "18:00" },
    ]);
    expect(futureFree("2026-11-05", FREE, "2026-11-05T07:00")).toEqual([
      { start: "07:00", end: "08:00" },
      { start: "13:30", end: "18:00" },
    ]);
    expect(futureFree("2026-11-05", FREE, "2026-11-05T19:00")).toEqual([]);
  });
});

function renderColumn(target: DayAgenda) {
  const onSelectSlot = mock();
  const onDraftChange = mock();
  const { container } = render(
    <DayColumn
      day={target}
      scale={makeScale("06:00", "23:00", 1.1)}
      now={null}
      onSelectSlot={onSelectSlot}
      canDraft
      onDraftChange={onDraftChange}
    />,
  );
  const column = container.querySelector(".relative.min-w-0") as HTMLElement;
  return { column, onSelectSlot, onDraftChange, container };
}

const press = (y: number) => ({ clientY: y, pointerId: 1, pointerType: "mouse", button: 0 });

describe("DayColumn: horário passado", () => {
  test("dia anterior a hoje: sem botão de livre, sem rascunho e véu sobre o dia inteiro", () => {
    const { column, onDraftChange, onSelectSlot, container } = renderColumn(
      day("2026-11-04", "2026-11-05T10:00"),
    );
    expect(container.querySelectorAll("button")).toHaveLength(0);
    fireEvent.pointerDown(column, press(300));
    fireEvent.pointerUp(column, press(300));
    expect(onDraftChange).not.toHaveBeenCalled();
    expect(onSelectSlot).not.toHaveBeenCalled();
    expect(container.querySelector("[data-past-shade]")).not.toBeNull();
  });

  test("hoje: o livre que já passou some, o futuro continua reservável e o véu cobre só até o agora", () => {
    const { column, onDraftChange, container } = renderColumn(
      day("2026-11-05", "2026-11-05T10:00"),
    );
    const buttons = [...container.querySelectorAll("button")].map((b) =>
      b.getAttribute("aria-label"),
    );
    expect(buttons).toEqual(["Livre, Livre, 13:30–18:00. Reservar"]);
    // 07:00 (y = 10 + 60 * 1.1) já passou; 14:00 (y = 10 + 480 * 1.1) não.
    fireEvent.pointerDown(column, press(76));
    fireEvent.pointerUp(column, press(76));
    expect(onDraftChange).not.toHaveBeenCalled();
    fireEvent.pointerDown(column, press(538));
    fireEvent.pointerUp(column, press(538));
    expect(onDraftChange).toHaveBeenCalled();
    const shade = container.querySelector("[data-past-shade]") as HTMLElement;
    expect(shade.style.height).toBe(`${10 + (10 * 60 - 360) * 1.1}px`);
  });

  test("dia futuro: tudo livre, sem véu", () => {
    const { container } = renderColumn(day("2026-11-06", "2026-11-05T10:00"));
    expect(container.querySelectorAll("button")).toHaveLength(2);
    expect(container.querySelector("[data-past-shade]")).toBeNull();
  });
});
