import { describe, expect, mock, test } from "bun:test";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { MyBooking } from "#/application/bookings";
import { CancelDialog, type CancelDialogProps } from "#/components/agenda/cancel-dialog";
import { MinhasReservasList } from "#/routes/minhas-reservas";

const booking = (id: string, inSeries: boolean): MyBooking => ({
  id,
  spaceId: "space-adm",
  spaceName: "ADM 2",
  date: "2030-12-10",
  start: "10:00",
  end: "11:00",
  title: "Monitoria",
  source: "manual",
  status: "ativa",
  canCancel: true,
  mine: true,
  person: null,
  inSeries,
});

describe("Minhas reservas: selo de série", () => {
  test("o selo 'Série' aparece só no cartão da reserva de série", async () => {
    const root = createRootRoute({
      component: () => (
        <MinhasReservasList items={[booking("serie-1", true), booking("avulsa-1", false)]} />
      ),
    });
    const home = createRoute({ getParentRoute: () => root, path: "/", component: () => null });
    const router = createRouter({
      routeTree: root.addChildren([home]),
      history: createMemoryHistory({ initialEntries: ["/"] }),
    });
    await router.load();
    render(<RouterProvider router={router} />);
    const series = await screen.findByTestId("booking-card-serie-1");
    expect(within(series).getByTestId("series-badge").textContent).toBe("Série");
    const lone = screen.getByTestId("booking-card-avulsa-1");
    expect(within(lone).queryByTestId("series-badge") === null).toBe(true);
  });
});

describe("CancelDialog: reserva de série", () => {
  function renderDialog(props: Partial<CancelDialogProps>) {
    render(
      <CancelDialog
        open
        onOpenChange={() => {}}
        target={{ ...booking("serie-1", true), inSeries: true }}
        {...props}
      />,
    );
  }

  test("oferece 'Somente esta' e 'Esta e as próximas'", () => {
    renderDialog({});
    expect(screen.getByText("Reserva feita por você, parte de uma série.")).toBeDefined();
    expect(screen.getByRole("radio", { name: /Somente esta \(10\/12\)/ })).toBeDefined();
    expect(screen.getByRole("radio", { name: /Esta e as próximas/ })).toBeDefined();
    expect(screen.getByRole("button", { name: "Cancelar só 10/12" })).toBeDefined();
  });

  test("'Esta e as próximas' mostra a prévia e cancela com o tamanho visto", async () => {
    const previewFn = mock(async () => ({
      ok: true as const,
      data: { dates: ["2030-12-10", "2030-12-17", "2030-12-24"] },
    }));
    const cancelFn = mock(async () => ({ ok: true as const, data: { cancelled: 3 } }));
    renderDialog({ previewFn, cancelFn });
    fireEvent.click(screen.getByRole("radio", { name: /Esta e as próximas/ }));
    const confirm = await screen.findByRole("button", {
      name: "Cancelar esta e as próximas (3)",
    });
    expect(previewFn).toHaveBeenCalledWith({ data: { occupationId: "serie-1" } });
    expect(screen.getByText("3 datas serão canceladas:")).toBeDefined();
    fireEvent.click(confirm);
    await screen.findByRole("button", { name: /Cancelar esta e as próximas/ });
    expect(cancelFn).toHaveBeenCalledWith({
      data: { occupationId: "serie-1", scope: "serie", expectedCount: 3 },
    });
  });

  test("avulsa fora de série continua sem opções", () => {
    renderDialog({ target: booking("avulsa-1", false) });
    expect(screen.queryByRole("radio") === null).toBe(true);
    expect(screen.getByRole("button", { name: "Cancelar reserva" })).toBeDefined();
  });
});
