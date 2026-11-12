import { describe, expect, mock, test } from "bun:test";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { BookingSheet } from "./booking-sheet";

const spaces = [{ id: "a", name: "A-202", capacity: 30 }];

/** Renderiza dentro de um roteador em memória: o BookingSheet usa `Link` na tela de sucesso. */
function renderWithRouter(children: ReactNode) {
  const root = createRootRoute({ component: () => <>{children}</> });
  const routes = ["/", "/minhas-reservas"].map((path) =>
    createRoute({ getParentRoute: () => root, path }),
  );
  const router = createRouter({
    routeTree: root.addChildren(routes),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return render(<RouterProvider router={router} />);
}

function makeCreateFn() {
  return mock(async ({ data }: { data: { purpose: string } }) => ({
    ok: true as const,
    data: {
      id: "1",
      spaceId: "a",
      date: "2026-11-10",
      start: "08:00",
      end: "09:50",
      title: data.purpose,
    },
  }));
}

describe("BookingSheet — tipo de reserva (manutenção)", () => {
  test("sem a permissão de manutenção, não mostra o campo Tipo", async () => {
    renderWithRouter(
      <BookingSheet open={true} onOpenChange={() => {}} spaces={spaces} canMaintenance={false} />,
    );
    await screen.findByLabelText("Matéria ou título");
    expect(screen.queryByText("Tipo")).toBeNull();
    expect(screen.queryByText("Manutenção")).toBeNull();
  });

  test("com a permissão, mostra Tipo com 'Aula ou evento' selecionado por padrão", async () => {
    renderWithRouter(
      <BookingSheet open={true} onOpenChange={() => {}} spaces={spaces} canMaintenance={true} />,
    );
    expect(await screen.findByText("Tipo")).toBeDefined();
    const eventoOption = screen.getByRole("radio", { name: /Aula ou evento/ });
    expect(eventoOption).toHaveProperty("checked", true);
    expect(screen.getByLabelText("Matéria ou título")).toBeDefined();
  });

  test("ao escolher Manutenção, o rótulo muda e o envio prefixa a finalidade", async () => {
    const createFn = makeCreateFn();
    renderWithRouter(
      <BookingSheet
        open={true}
        onOpenChange={() => {}}
        spaces={spaces}
        canMaintenance={true}
        createFn={createFn}
        initialSlot={{ spaceId: "a", date: "2099-01-01", start: "08:00", end: "09:50" }}
      />,
    );
    await screen.findByText("Tipo");
    fireEvent.click(screen.getByRole("radio", { name: /Manutenção/ }));
    expect(screen.getByText("Descrição da manutenção")).toBeDefined();

    fireEvent.change(screen.getByLabelText("Descrição da manutenção"), {
      target: { value: "Troca de lâmpada" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Reservar" }));

    await waitFor(() => expect(createFn).toHaveBeenCalledTimes(1));
    const call = createFn.mock.calls[0]?.[0] as { data: { purpose: string } };
    expect(call.data.purpose).toBe("Manutenção: Troca de lâmpada");
  });
});
