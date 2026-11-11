import { expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { EditBookingDialog } from "#/components/agenda/edit-booking-dialog";

test("preenche a ocorrência e mantém o diálogo aberto quando o servidor recusa", async () => {
  const save = mock(async (..._args: unknown[]) => ({
    ok: false as const,
    status: 409 as const,
    message: "Horário ocupado.",
  }));
  const done = mock((..._args: unknown[]) => {});
  render(
    <EditBookingDialog
      open
      onOpenChange={() => {}}
      onSaved={done}
      spaces={[{ id: "s", name: "Sala", capacity: null }]}
      target={{
        id: "b",
        spaceId: "s",
        date: "2030-11-10",
        start: "10:00",
        end: "11:00",
        title: "Original",
        inSeries: true,
      }}
      saveFn={save}
    />,
  );
  expect((screen.getByLabelText("Finalidade") as HTMLInputElement).value).toBe("Original");
  const dialog = screen.getByRole("alertdialog");
  expect(dialog.className).toContain("max-h-[90dvh]");
  expect(dialog.className).toContain("overflow-y-auto");
  expect(screen.getByText("Somente esta ocorrência será alterada.")).toBeDefined();
  fireEvent.change(screen.getByLabelText("Finalidade"), { target: { value: "Alterada" } });
  fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
  await waitFor(() => expect(save).toHaveBeenCalled());
  expect(save.mock.calls[0]).toEqual([
    {
      data: {
        occupationId: "b",
        spaceId: "s",
        date: "2030-11-10",
        start: "10:00",
        end: "11:00",
        purpose: "Alterada",
      },
    },
  ]);
  expect(await screen.findByText("Horário ocupado.")).toBeDefined();
  expect(done).not.toHaveBeenCalled();
});

test("notifica sucesso somente após salvar a ocorrência", async () => {
  cleanup();
  const target = {
    id: "b",
    spaceId: "s",
    date: "2030-11-10",
    start: "10:00",
    end: "11:00",
    title: "Original",
    inSeries: false,
  };
  const done = mock((..._args: unknown[]) => {});
  render(
    <EditBookingDialog
      open
      onOpenChange={() => {}}
      onSaved={done}
      target={target}
      spaces={[{ id: "s", name: "Sala", capacity: null }]}
      saveFn={async () => ({ ok: true as const, data: target })}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
  await waitFor(() => expect(done).toHaveBeenCalledTimes(1));
});
