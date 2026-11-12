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
  expect(
    screen.getByText("Escolha se altera uma ocorrência ou as próximas datas da série."),
  ).toBeDefined();
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

test("prévia e confirmação aplicam o escopo às próximas ocorrências da série", async () => {
  cleanup();
  const target = {
    id: "b-1",
    spaceId: "s",
    date: "2030-11-10",
    start: "10:00",
    end: "11:00",
    title: "Original",
    inSeries: true,
  };
  const previewSeries = mock(async (..._args: unknown[]) => ({
    ok: true as const,
    data: {
      scope: "future" as const,
      count: 2,
      revision: "a".repeat(64),
      changes: [
        { from: "2030-11-10", to: "2030-11-11" },
        { from: "2030-11-17", to: "2030-11-18" },
      ],
    },
  }));
  const saveSeries = mock(async (..._args: unknown[]) => ({
    ok: true as const,
    data: { updated: 2, dates: ["2030-11-11", "2030-11-18"] },
  }));
  const done = mock((..._args: unknown[]) => {});
  render(
    <EditBookingDialog
      open
      onOpenChange={() => {}}
      onSaved={done}
      target={target}
      spaces={[{ id: "s", name: "Sala", capacity: null }]}
      previewSeriesFn={previewSeries}
      saveSeriesFn={saveSeries}
    />,
  );

  fireEvent.click(screen.getByLabelText("Esta e as próximas ocorrências"));
  fireEvent.change(screen.getByLabelText("Data"), { target: { value: "2030-11-11" } });
  fireEvent.click(screen.getByRole("button", { name: "Revisar alterações" }));
  await waitFor(() => expect(previewSeries).toHaveBeenCalledTimes(1));
  expect(screen.getByTestId("series-edit-preview").textContent).toContain(
    "2030-11-10 → 2030-11-11",
  );

  fireEvent.click(screen.getByRole("button", { name: "Confirmar 2 alterações" }));
  await waitFor(() => expect(saveSeries).toHaveBeenCalledTimes(1));
  expect(saveSeries.mock.calls[0]?.[0]).toMatchObject({
    data: {
      occupationId: "b-1",
      date: "2030-11-11",
      scope: "future",
      expectedCount: 2,
      expectedRevision: "a".repeat(64),
    },
  });
  expect(done).toHaveBeenCalledTimes(1);
});
