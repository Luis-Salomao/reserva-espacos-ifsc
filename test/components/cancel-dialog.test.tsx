import { describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  CancelDialog,
  type CancelDialogProps,
  type CancelTarget,
} from "#/components/agenda/cancel-dialog";

const MOCK_MANUAL_TARGET: CancelTarget = {
  id: "occ-manual-1",
  date: "2026-11-03",
  start: "10:10",
  end: "12:00",
  title: "Reunião de Colegiado",
  source: "manual",
  spaceName: "ADM 2",
};

const MOCK_IMPORTED_TARGET: CancelTarget = {
  id: "occ-import-2",
  date: "2026-11-03",
  start: "08:00",
  end: "09:40",
  title: "Cálculo I",
  source: "import",
  spaceName: "LAB 1",
};

function renderCancelDialog(props: Partial<CancelDialogProps> = {}) {
  const onOpenChange = props.onOpenChange ?? mock((..._args: unknown[]) => {});
  const onSuccess = props.onSuccess ?? mock((..._args: unknown[]) => {});
  const onCancelled = props.onCancelled ?? mock((..._args: unknown[]) => {});

  const result = render(
    <CancelDialog
      open={props.open ?? true}
      onOpenChange={onOpenChange}
      target={props.target ?? MOCK_MANUAL_TARGET}
      onSuccess={onSuccess}
      onCancelled={onCancelled}
      {...(props.cancelFn === undefined ? {} : { cancelFn: props.cancelFn })}
      {...(props.previewFn === undefined ? {} : { previewFn: props.previewFn })}
    />,
  );

  return { ...result, onOpenChange, onSuccess, onCancelled };
}

describe("CancelDialog — Suíte de Testes (Milestone 2 Task 4)", () => {
  test("1. Reserva manual: renderiza layout de cancelamento avulso", () => {
    renderCancelDialog({ target: MOCK_MANUAL_TARGET });

    expect(screen.getByRole("alertdialog")).toBeDefined();
    expect(screen.getByRole("heading", { name: "Cancelar reserva" })).toBeDefined();
    expect(screen.getByText("Reserva feita por você.")).toBeDefined();
    expect(screen.getByText("Reunião de Colegiado")).toBeDefined();
    expect(screen.getByText("ADM 2")).toBeDefined();
    expect(screen.getByText(/Cancelar esta reserva em/i)).toBeDefined();
    expect(screen.getByText("03/11")).toBeDefined();
    expect(screen.getByText(/Isso libera a sala para outras pessoas/i)).toBeDefined();
  });

  test("2. Reserva manual: NÃO exibe opções de rádio de série", () => {
    renderCancelDialog({ target: MOCK_MANUAL_TARGET });

    expect(screen.queryByRole("group")).toBeNull();
    expect(screen.queryByText(/Toda a série a partir de hoje/i)).toBeNull();
    expect(screen.queryByRole("radio")).toBeNull();
  });

  test("3. Reserva manual: confirmação aciona cancelFn avulso (scope='data') sem expectedCount", async () => {
    const mockCancel = mock(async (..._args: unknown[]) => ({
      ok: true as const,
      data: { cancelled: 1 },
    }));
    const { onOpenChange, onSuccess } = renderCancelDialog({
      target: MOCK_MANUAL_TARGET,
      cancelFn: mockCancel,
    });

    const confirmBtn = screen.getByRole("button", { name: "Cancelar reserva" });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(mockCancel).toHaveBeenCalledTimes(1);
    });

    expect(mockCancel.mock.calls[0]?.[0]).toEqual({
      data: {
        occupationId: "occ-manual-1",
        scope: "data",
      },
    });

    expect(onSuccess).toHaveBeenCalledWith({ cancelled: 1, scope: "data" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  test("4. Reserva manual: botão 'Voltar' fecha o diálogo sem cancelar", () => {
    const mockCancel = mock(async (..._args: unknown[]) => ({
      ok: true as const,
      data: { cancelled: 1 },
    }));
    const { onOpenChange } = renderCancelDialog({
      target: MOCK_MANUAL_TARGET,
      cancelFn: mockCancel,
    });

    const backBtn = screen.getByRole("button", { name: "Voltar" });
    fireEvent.click(backBtn);

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(mockCancel).not.toHaveBeenCalled();
  });

  test("5. Aula importada: renderiza opções de rádio para escopo de cancelamento", () => {
    renderCancelDialog({ target: MOCK_IMPORTED_TARGET });

    expect(
      screen.getByText("Aula importada do horário oficial. Você é a pessoa responsável."),
    ).toBeDefined();
    expect(screen.getByText("O que cancelar?")).toBeDefined();
    expect(screen.getByText("Somente 03/11")).toBeDefined();
    expect(screen.getByText("Toda a série a partir de hoje")).toBeDefined();
  });

  test("6. Aula importada: padrão é escopo avulso 'Somente DD/MM'", () => {
    renderCancelDialog({ target: MOCK_IMPORTED_TARGET });

    const radios = screen.getAllByRole("radio") as HTMLInputElement[];
    expect(radios).toHaveLength(2);
    expect(radios[0]?.checked).toBe(true);
    expect(radios[1]?.checked).toBe(false);

    expect(screen.getByRole("button", { name: "Cancelar só 03/11" })).toBeDefined();
  });

  test("7. Aula importada: envio de ocorrência única", async () => {
    const mockCancel = mock(async (..._args: unknown[]) => ({
      ok: true as const,
      data: { cancelled: 1 },
    }));
    renderCancelDialog({
      target: MOCK_IMPORTED_TARGET,
      cancelFn: mockCancel,
    });

    const confirmBtn = screen.getByRole("button", { name: "Cancelar só 03/11" });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(mockCancel).toHaveBeenCalledTimes(1);
    });

    expect(mockCancel.mock.calls[0]?.[0]).toEqual({
      data: {
        occupationId: "occ-import-2",
        scope: "data",
      },
    });
  });

  test("8. Selecionar série dispara busca da prévia via previewFn", async () => {
    const mockPreview = mock(async (..._args: unknown[]) => ({
      ok: true as const,
      data: { dates: ["2026-11-10", "2026-11-17"] },
    }));

    renderCancelDialog({
      target: MOCK_IMPORTED_TARGET,
      previewFn: mockPreview,
    });

    const radios = screen.getAllByRole("radio");
    fireEvent.click(radios[1] as HTMLElement);

    await waitFor(() => {
      expect(mockPreview).toHaveBeenCalledTimes(1);
    });

    expect(mockPreview.mock.calls[0]?.[0]).toEqual({
      data: { occupationId: "occ-import-2" },
    });
  });

  test("9. Indicador de carregamento enquanto busca prévia da série", async () => {
    let resolvePreview!: (val: unknown) => void;
    const pendingPromise = new Promise((resolve) => {
      resolvePreview = resolve;
    });

    const mockPreview = mock(
      () => pendingPromise as unknown as Promise<{ ok: true; data: { dates: string[] } }>,
    );

    renderCancelDialog({
      target: MOCK_IMPORTED_TARGET,
      previewFn: mockPreview,
    });

    const radios = screen.getAllByRole("radio");
    fireEvent.click(radios[1] as HTMLElement);

    expect(screen.getByText("Buscando datas futuras da série…")).toBeDefined();
    const submitBtn = screen.getByRole("button", { name: /Cancelar toda a série/i });
    expect(submitBtn.hasAttribute("disabled")).toBe(true);

    // Resolve a prévia
    resolvePreview({ ok: true as const, data: { dates: ["2026-11-10"] } });
    await screen.findByText("1 data será cancelada:");
  });

  test("10. Prévia da série renderiza lista com as datas afetadas", async () => {
    const mockPreview = mock(async (..._args: unknown[]) => ({
      ok: true as const,
      data: { dates: ["2026-11-10", "2026-11-17", "2026-11-24"] },
    }));

    renderCancelDialog({
      target: MOCK_IMPORTED_TARGET,
      previewFn: mockPreview,
    });

    const radios = screen.getAllByRole("radio");
    fireEvent.click(radios[1] as HTMLElement);

    await screen.findByText("3 datas serão canceladas:");
    expect(screen.getByText("10/11")).toBeDefined();
    expect(screen.getByText("17/11")).toBeDefined();
    expect(screen.getByText("24/11")).toBeDefined();
  });

  test("11. Rótulo do botão de confirmação exibe contagem das datas da série", async () => {
    const mockPreview = mock(async (..._args: unknown[]) => ({
      ok: true as const,
      data: { dates: ["2026-11-10", "2026-11-17"] },
    }));

    renderCancelDialog({
      target: MOCK_IMPORTED_TARGET,
      previewFn: mockPreview,
    });

    const radios = screen.getAllByRole("radio");
    fireEvent.click(radios[1] as HTMLElement);

    await screen.findByRole("button", { name: "Cancelar toda a série (2)" });
  });

  test("12. Falha na prévia da série exibe mensagem de erro e desabilita botão", async () => {
    const mockPreview = mock(async (..._args: unknown[]) => ({
      ok: false as const,
      status: 400 as const,
      message: "Falha ao carregar datas da série.",
    }));

    renderCancelDialog({
      target: MOCK_IMPORTED_TARGET,
      previewFn: mockPreview,
    });

    const radios = screen.getAllByRole("radio");
    fireEvent.click(radios[1] as HTMLElement);

    await screen.findByText("Falha ao carregar datas da série.");
    const submitBtn = screen.getByRole("button", { name: /Cancelar toda a série/i });
    expect(submitBtn.hasAttribute("disabled")).toBe(true);
  });

  test("13. Proteção de concorrência: envia expectedCount correspondente ao previewDates.length", async () => {
    const mockPreview = mock(async (..._args: unknown[]) => ({
      ok: true as const,
      data: { dates: ["2026-11-10", "2026-11-17"] },
    }));
    const mockCancel = mock(async (..._args: unknown[]) => ({
      ok: true as const,
      data: { cancelled: 2 },
    }));

    renderCancelDialog({
      target: MOCK_IMPORTED_TARGET,
      previewFn: mockPreview,
      cancelFn: mockCancel,
    });

    const radios = screen.getAllByRole("radio");
    fireEvent.click(radios[1] as HTMLElement);

    const confirmBtn = await screen.findByRole("button", { name: "Cancelar toda a série (2)" });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(mockCancel).toHaveBeenCalledTimes(1);
    });

    expect(mockCancel.mock.calls[0]?.[0]).toEqual({
      data: {
        occupationId: "occ-import-2",
        scope: "serie",
        expectedCount: 2,
      },
    });
  });

  test("14. Concorrência 409 SERIES_CHANGED: exibe alerta de conflito inline", async () => {
    const mockPreview = mock(async (..._args: unknown[]) => ({
      ok: true as const,
      data: { dates: ["2026-11-10", "2026-11-17"] },
    }));
    const mockCancel = mock(async (..._args: unknown[]) => ({
      ok: false as const,
      status: 409 as const,
      message: "A série mudou desde a confirmação. Revise as datas e confirme de novo.",
    }));

    renderCancelDialog({
      target: MOCK_IMPORTED_TARGET,
      previewFn: mockPreview,
      cancelFn: mockCancel,
    });

    const radios = screen.getAllByRole("radio");
    fireEvent.click(radios[1] as HTMLElement);

    const confirmBtn = await screen.findByRole("button", { name: "Cancelar toda a série (2)" });
    fireEvent.click(confirmBtn);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("A série mudou desde a confirmação");
  });

  test("15. Concorrência 409 SERIES_CHANGED: re-dispara previewFn automaticamente", async () => {
    let callCount = 0;
    const mockPreview = mock(async (..._args: unknown[]) => {
      callCount++;
      return {
        ok: true as const,
        data: { dates: callCount === 1 ? ["2026-11-10", "2026-11-17"] : ["2026-11-10"] },
      };
    });

    const mockCancel = mock(async (..._args: unknown[]) => ({
      ok: false as const,
      status: 409 as const,
      message: "A série mudou desde a confirmação. Revise as datas e confirme de novo.",
    }));

    renderCancelDialog({
      target: MOCK_IMPORTED_TARGET,
      previewFn: mockPreview,
      cancelFn: mockCancel,
    });

    const radios = screen.getAllByRole("radio");
    fireEvent.click(radios[1] as HTMLElement);

    const confirmBtn = await screen.findByRole("button", { name: "Cancelar toda a série (2)" });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(mockPreview).toHaveBeenCalledTimes(2);
    });

    // Atualizou contagem após 409
    await screen.findByRole("button", { name: "Cancelar toda a série (1)" });
  });

  test("16. Já cancelada 409 ALREADY_CANCELLED: exibe alerta de erro", async () => {
    const mockCancel = mock(async (..._args: unknown[]) => ({
      ok: false as const,
      status: 409 as const,
      message: "Esta ocupação já foi cancelada.",
    }));

    renderCancelDialog({
      target: MOCK_MANUAL_TARGET,
      cancelFn: mockCancel,
    });

    const confirmBtn = screen.getByRole("button", { name: "Cancelar reserva" });
    fireEvent.click(confirmBtn);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Esta ocupação já foi cancelada.");
  });

  test("17. Estado de envio desabilita botões de ação e exibe 'Cancelando…'", async () => {
    let resolveCancel!: (val: unknown) => void;
    const pendingPromise = new Promise((resolve) => {
      resolveCancel = resolve;
    });

    const mockCancel = mock(
      () => pendingPromise as unknown as Promise<{ ok: true; data: { cancelled: number } }>,
    );

    renderCancelDialog({
      target: MOCK_MANUAL_TARGET,
      cancelFn: mockCancel,
    });

    const confirmBtn = screen.getByRole("button", { name: "Cancelar reserva" });
    fireEvent.click(confirmBtn);

    expect(screen.getByRole("button", { name: "Cancelando…" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Voltar" }).hasAttribute("disabled")).toBe(true);

    resolveCancel({ ok: true as const, data: { cancelled: 1 } });
  });

  test("18. Trata 403 Forbidden exibindo mensagem de permissão no alerta", async () => {
    const mockCancel = mock(async (..._args: unknown[]) => ({
      ok: false as const,
      status: 403 as const,
      message: "Sem permissão para cancelar esta ocupação.",
    }));

    renderCancelDialog({
      target: MOCK_MANUAL_TARGET,
      cancelFn: mockCancel,
    });

    const confirmBtn = screen.getByRole("button", { name: "Cancelar reserva" });
    fireEvent.click(confirmBtn);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Sem permissão para cancelar esta ocupação.");
  });
});

describe("CancelDialog — dateOnly (aula importada, uma data só)", () => {
  test("não oferece série, não chama previewFn e cancela só a data", async () => {
    const previewFn = mock(async (..._args: unknown[]) => ({
      ok: true as const,
      data: { dates: ["2026-11-03"] },
    }));
    const cancelFn = mock(async (..._args: unknown[]) => ({
      ok: true as const,
      data: { cancelled: 1 },
    }));
    const onCancelled = mock((..._args: unknown[]) => {});
    render(
      <CancelDialog
        open
        onOpenChange={() => {}}
        target={MOCK_IMPORTED_TARGET}
        dateOnly
        previewFn={previewFn}
        cancelFn={cancelFn}
        onCancelled={onCancelled}
      />,
    );

    expect(screen.queryByText(/Reserva feita por você/)).toBeNull();
    expect(screen.getByText(/Aula importada/)).toBeDefined();
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.queryByText(/série/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Desmarcar esta data" }));

    await waitFor(() => expect(onCancelled).toHaveBeenCalledTimes(1));
    expect(previewFn).not.toHaveBeenCalled();
    expect(cancelFn).toHaveBeenCalledWith({
      data: { occupationId: "occ-import-2", scope: "data" },
    });
  });
});
