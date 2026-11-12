import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { AgendaItem } from "#/application/bookings";
import type { NoticesOverview, RequestView } from "#/application/notifications";
import { CancelDialog, type CancelTarget } from "#/components/agenda/cancel-dialog";
import { OccupationDetails } from "#/components/agenda/occupation-details";
import { RequestRoomDialog } from "#/components/agenda/request-room-dialog";
import { NoticesSection } from "#/components/notices/notices-section";

afterEach(cleanup);

const ok = async (..._args: unknown[]) => ({ ok: true as const, data: {} });

const incoming: RequestView = {
  id: "r1",
  status: "pendente",
  purpose: "Prova de Cálculo",
  message: "Preciso da sala grande",
  decisionNote: null,
  spaceName: "A-202",
  date: "2026-11-12",
  start: "13:30",
  end: "15:20",
  requesterName: "Ana Souza",
  ownerName: "Bia Lima",
  createdAt: "2026-11-03T12:00:00.000Z",
};

const empty: NoticesOverview = { notices: [], incoming: [], outgoing: [] };

describe("NoticesSection", () => {
  test("some quando não há avisos nem pedidos", () => {
    const { container } = render(<NoticesSection overview={empty} onChanged={() => {}} />);
    expect(container.textContent).toBe("");
  });

  test("pedido recebido: mostra quem pediu e aceita", async () => {
    const acceptFn = mock(ok);
    const onChanged = mock(() => {});
    render(
      <NoticesSection
        overview={{ ...empty, incoming: [incoming] }}
        onChanged={onChanged}
        acceptFn={acceptFn}
      />,
    );
    expect(screen.getByRole("heading", { name: "Avisos e pedidos" })).toBeDefined();
    expect(screen.getByText("Ana Souza pediu esta sala")).toBeDefined();
    expect(screen.getByText(/A-202 · qui 12\/11 · 13:30–15:20/)).toBeDefined();
    expect(screen.getByText("Finalidade: Prova de Cálculo")).toBeDefined();
    expect(screen.getByText("Mensagem: Preciso da sala grande")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Aceitar pedido de Ana Souza para A-202" }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(acceptFn.mock.calls[0]?.[0]).toEqual({ data: { requestId: "r1" } });
  });

  test("recusar abre diálogo com motivo opcional e envia o motivo", async () => {
    const declineFn = mock(ok);
    const onChanged = mock(() => {});
    render(
      <NoticesSection
        overview={{ ...empty, incoming: [incoming] }}
        onChanged={onChanged}
        declineFn={declineFn}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Recusar pedido de Ana Souza" }));
    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByRole("heading", { name: "Recusar pedido" })).toBeDefined();
    fireEvent.change(within(dialog).getByLabelText(/Motivo \(opcional/), {
      target: { value: "Uso a sala nesse dia" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Recusar pedido" }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(declineFn.mock.calls[0]?.[0]).toEqual({
      data: { requestId: "r1", note: "Uso a sala nesse dia" },
    });
  });

  test("recusar sem motivo não manda nota; Voltar fecha o diálogo", async () => {
    const declineFn = mock(ok);
    render(
      <NoticesSection
        overview={{ ...empty, incoming: [incoming] }}
        onChanged={() => {}}
        declineFn={declineFn}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Recusar pedido de Ana Souza" }));
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", { name: "Voltar" }),
    );
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Recusar pedido de Ana Souza" }));
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", { name: "Recusar pedido" }),
    );
    await waitFor(() => expect(declineFn).toHaveBeenCalledTimes(1));
    expect(declineFn.mock.calls[0]?.[0]).toEqual({ data: { requestId: "r1" } });
  });

  test("avisos: não lidos têm ponto e fundo próprio; lidos não", () => {
    render(
      <NoticesSection
        overview={{
          ...empty,
          notices: [
            {
              id: "n1",
              kind: "reserva_cancelada",
              text: "A administração cancelou X",
              createdAt: "x",
              unread: true,
            },
            { id: "n2", kind: "pedido_aceito", text: "Bia aceitou", createdAt: "x", unread: false },
          ],
        }}
        onChanged={() => {}}
      />,
    );
    const unread = screen.getByText("A administração cancelou X").closest("li");
    const read = screen.getByText("Bia aceitou").closest("li");
    expect(unread?.dataset.unread).toBe("true");
    expect(unread?.className).toContain("bg-surface-2");
    expect(within(unread as HTMLElement).getByText("Novo")).toBeDefined();
    expect(read?.dataset.unread).toBe("false");
    expect(within(read as HTMLElement).queryByText("Novo")).toBeNull();
  });

  test("seus pedidos: situação em etiqueta e Desistir só no pendente", async () => {
    const withdrawFn = mock(ok);
    const onChanged = mock(() => {});
    render(
      <NoticesSection
        overview={{
          ...empty,
          outgoing: [
            { ...incoming, id: "p" },
            { ...incoming, id: "a", status: "aceito" },
            { ...incoming, id: "r", status: "recusado", decisionNote: "Uso a sala" },
            { ...incoming, id: "i", status: "indisponivel" },
            { ...incoming, id: "e", status: "encerrado" },
            { ...incoming, id: "c", status: "cancelado" },
          ],
        }}
        onChanged={onChanged}
        withdrawFn={withdrawFn}
      />,
    );
    for (const label of [
      "Aguardando",
      "Aceito",
      "Recusado",
      "Não está mais disponível",
      "Encerrado",
      "Cancelado",
    ]) {
      expect(screen.getByText(label)).toBeDefined();
    }
    expect(screen.getByText("Motivo: Uso a sala")).toBeDefined();
    const buttons = screen.getAllByRole("button", { name: /Desistir/ });
    expect(buttons).toHaveLength(1);
    fireEvent.click(buttons[0] as HTMLElement);
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(withdrawFn.mock.calls[0]?.[0]).toEqual({ data: { requestId: "p" } });
  });

  test("falha da ação aparece como alerta e a lista é recarregada", async () => {
    const acceptFn = mock(async (..._args: unknown[]) => ({
      ok: false as const,
      status: 409 as const,
      message: "Este pedido não está mais disponível.",
    }));
    const onChanged = mock(() => {});
    render(
      <NoticesSection
        overview={{ ...empty, incoming: [incoming] }}
        onChanged={onChanged}
        acceptFn={acceptFn}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Aceitar pedido/ }));
    expect((await screen.findByRole("alert")).textContent).toContain("não está mais disponível");
    expect(onChanged).toHaveBeenCalledTimes(1);
  });
});

describe("RequestRoomDialog", () => {
  const target = {
    id: "occ-1",
    spaceName: "A-202",
    date: "2026-11-12",
    start: "13:30",
    end: "15:20",
  };

  test("envia finalidade e mensagem e avisa que foi enviado", async () => {
    const requestFn = mock(async (..._args: unknown[]) => ({
      ok: true as const,
      data: { id: "r" },
    }));
    const onSent = mock(() => {});
    render(
      <RequestRoomDialog
        target={target}
        onOpenChange={() => {}}
        onSent={onSent}
        requestFn={requestFn}
      />,
    );
    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByRole("heading", { name: "Pedir esta sala" })).toBeDefined();
    fireEvent.change(within(dialog).getByLabelText("Finalidade"), { target: { value: "Prova" } });
    fireEvent.change(within(dialog).getByLabelText(/Mensagem/), { target: { value: "Por favor" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Enviar pedido" }));
    await waitFor(() => expect(onSent).toHaveBeenCalledTimes(1));
    expect(requestFn.mock.calls[0]?.[0]).toEqual({
      data: { occupationId: "occ-1", purpose: "Prova", message: "Por favor" },
    });
  });

  test("sem mensagem não envia o campo; erro do servidor fica visível", async () => {
    const requestFn = mock(async (..._args: unknown[]) => ({
      ok: false as const,
      status: 409 as const,
      message: "Você já tem um pedido pendente para esta sala nesta data.",
    }));
    const onSent = mock(() => {});
    render(
      <RequestRoomDialog
        target={target}
        onOpenChange={() => {}}
        onSent={onSent}
        requestFn={requestFn}
      />,
    );
    fireEvent.change(screen.getByLabelText("Finalidade"), { target: { value: "Prova" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));
    expect((await screen.findByRole("alert")).textContent).toContain("já tem um pedido pendente");
    expect(requestFn.mock.calls[0]?.[0]).toEqual({
      data: { occupationId: "occ-1", purpose: "Prova" },
    });
    expect(onSent).not.toHaveBeenCalled();
  });

  test("Voltar fecha; sem alvo não há diálogo", () => {
    const onOpenChange = mock((_open: boolean) => {});
    const { rerender } = render(
      <RequestRoomDialog target={target} onOpenChange={onOpenChange} onSent={() => {}} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Voltar" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    rerender(<RequestRoomDialog target={null} onOpenChange={onOpenChange} onSent={() => {}} />);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});

describe("botão Pedir esta sala em OccupationDetails", () => {
  const item: AgendaItem = {
    id: "o1",
    date: "2026-11-12",
    start: "13:30",
    end: "15:20",
    title: "Cálculo I",
    source: "import",
    status: "ativa",
    canCancel: false,
    mine: false,
    person: { name: "Bia Lima", code: null, placeholder: false },
  };

  test("aparece só quando a ocupação aceita pedido", () => {
    const onRequest = mock((_item: AgendaItem) => {});
    const { rerender } = render(
      <OccupationDetails
        occupation={{ ...item, canRequest: true }}
        spaceName="A-202"
        onOpenChange={() => {}}
        onCancel={() => {}}
        onRequest={onRequest}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Pedir esta sala…" }));
    expect(onRequest).toHaveBeenCalledTimes(1);
    for (const occupation of [item, { ...item, canRequest: false }]) {
      rerender(
        <OccupationDetails
          occupation={occupation}
          spaceName="A-202"
          onOpenChange={() => {}}
          onCancel={() => {}}
          onRequest={onRequest}
        />,
      );
      expect(screen.queryByRole("button", { name: "Pedir esta sala…" })).toBeNull();
    }
  });
});

describe("motivo no cancelamento pela administração", () => {
  const base: CancelTarget = {
    id: "o1",
    date: "2026-11-12",
    start: "13:30",
    end: "15:20",
    title: "Reunião",
    source: "manual",
    spaceName: "A-202",
  };

  test("reserva de outra pessoa: campo de motivo vai junto no cancelamento", async () => {
    const cancelFn = mock(async (..._args: unknown[]) => ({
      ok: true as const,
      data: { cancelled: 1 },
    }));
    render(
      <CancelDialog
        open
        onOpenChange={() => {}}
        target={{ ...base, foreign: true }}
        cancelFn={cancelFn}
      />,
    );
    expect(screen.getByText(/será avisada do cancelamento/)).toBeDefined();
    fireEvent.change(screen.getByLabelText("Motivo (opcional, enviado ao responsável)"), {
      target: { value: "  Obra na sala  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancelar reserva" }));
    await waitFor(() => expect(cancelFn).toHaveBeenCalledTimes(1));
    expect(cancelFn.mock.calls[0]?.[0]).toEqual({
      data: { occupationId: "o1", scope: "data", note: "Obra na sala" },
    });
  });

  test("reserva própria não mostra o campo", () => {
    render(<CancelDialog open onOpenChange={() => {}} target={base} />);
    expect(screen.queryByLabelText(/Motivo/)).toBeNull();
  });
});
