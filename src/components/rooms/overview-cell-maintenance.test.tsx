import { describe, expect, test } from "bun:test";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { OverviewCell } from "./overview-cell";

function renderWithRouter(children: ReactNode) {
  const root = createRootRoute({ component: () => <>{children}</> });
  const router = createRouter({
    routeTree: root.addChildren([createRoute({ getParentRoute: () => root, path: "/" })]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return render(<RouterProvider router={router} />);
}

const item = {
  id: "1",
  date: "2026-11-10",
  start: "08:00",
  end: "09:50",
  title: "Manutenção: Troca de lâmpada",
  source: "manual" as const,
  status: "ativa" as const,
  person: null,
  mine: false,
  canCancel: false,
};

const cell = {
  block: { short: "M1", label: "Manhã 1", start: "08:00", end: "09:50" },
  items: [{ item, partial: false }],
};

describe("OverviewCell — manutenção", () => {
  test("cartão de detalhes mostra o ícone, a etiqueta e esconde o prefixo", async () => {
    renderWithRouter(
      <OverviewCell
        cell={cell}
        room={{ id: "r1", name: "A-202" }}
        date="2026-11-10"
        highlight={null}
        isVisitor={false}
        compact={false}
        selected={false}
        onSelect={() => {}}
        onPointerDown={() => {}}
        onPointerEnter={() => {}}
      />,
    );
    const link = await screen.findByRole("link");
    fireEvent.mouseEnter(link);
    expect(await screen.findByText("Troca de lâmpada")).toBeDefined();
    expect(screen.queryByText(/^Manutenção: /)).toBeNull();
    expect(within(screen.getByRole("tooltip")).getByText("Manutenção")).toBeDefined();
    expect(link.textContent).toContain("Manutenção");
  });
});
