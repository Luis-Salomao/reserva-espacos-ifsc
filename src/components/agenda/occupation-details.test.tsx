import { describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import type { AgendaItem } from "#/application/bookings";
import { OccupationDetails } from "./occupation-details";

const item = (source: "import" | "manual"): AgendaItem => ({
  id: "1",
  date: "2026-11-10",
  start: "08:00",
  end: "09:50",
  title: "Reunião",
  source,
  status: "ativa",
  canCancel: true,
  mine: true,
  person: null,
});

function setup(source: "import" | "manual", onEdit?: (o: AgendaItem) => void) {
  render(
    <OccupationDetails
      occupation={item(source)}
      spaceName="LAB 106A"
      onOpenChange={() => {}}
      onCancel={() => {}}
      {...(onEdit ? { onEdit } : {})}
    />,
  );
}

describe("OccupationDetails — Editar", () => {
  test("manual com onEdit mostra Editar… e chama onEdit(item)", () => {
    const onEdit = mock((_: AgendaItem) => {});
    setup("manual", onEdit);
    fireEvent.click(screen.getByRole("button", { name: "Editar…" }));
    expect(onEdit).toHaveBeenCalledWith(item("manual"));
  });

  test("importada não mostra Editar…", () => {
    setup("import", () => {});
    expect(screen.queryByRole("button", { name: "Editar…" })).toBeNull();
  });
});
