import { describe, expect, mock, test } from "bun:test";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { BookingView } from "#/application/bookings";
import {
  BookingSheet,
  type BookingSheetProps,
  TIMETABLE_SHORTCUTS,
} from "#/components/agenda/booking-sheet";
import type { Space } from "#/domain/space";

const MOCK_SPACES: Space[] = [
  { id: "space-adm", name: "ADM 2", capacity: 30 },
  { id: "space-lab", name: "LAB 1", capacity: 20 },
];

async function renderBookingSheet(props: Partial<BookingSheetProps> = {}) {
  const onOpenChange = props.onOpenChange ?? mock(() => {});
  const root = createRootRoute({
    component: () => (
      <BookingSheet
        open={props.open ?? true}
        onOpenChange={onOpenChange}
        spaces={props.spaces ?? MOCK_SPACES}
        initialSlot={props.initialSlot}
        timeZone={props.timeZone ?? "America/Sao_Paulo"}
        onSuccess={props.onSuccess}
        createFn={props.createFn}
      />
    ),
  });

  const minhasReservas = createRoute({
    getParentRoute: () => root,
    path: "/minhas-reservas",
    component: () => <div data-testid="minhas-reservas-page">Minhas reservas</div>,
  });

  const router = createRouter({
    routeTree: root.addChildren([minhasReservas]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });

  await router.load();
  render(<RouterProvider router={router} />);
  if (props.open !== false) {
    await screen.findByRole("dialog");
  }
  return { router, onOpenChange };
}

describe("BookingSheet — Suíte de Testes (Milestone 2 Task 4)", () => {
  test("1. Não renderiza o modal quando open=false", async () => {
    await renderBookingSheet({ open: false });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("2. Renderiza com título e pré-preenche campos a partir de initialSlot", async () => {
    await renderBookingSheet({
      open: true,
      initialSlot: {
        spaceId: "space-lab",
        date: "2026-11-20",
        start: "14:00",
        end: "16:00",
      },
    });

    expect(screen.getByRole("dialog")).toBeDefined();
    expect(screen.getByRole("heading", { name: "Nova reserva" })).toBeDefined();

    const roomSelect = screen.getByLabelText(/Sala/i) as HTMLSelectElement;
    expect(roomSelect.value).toBe("space-lab");

    const dateInput = screen.getByLabelText(/Data/i) as HTMLInputElement;
    expect(dateInput.value).toBe("2026-11-20");

    const startInput = screen.getByLabelText(/Início/i) as HTMLInputElement;
    expect(startInput.value).toBe("14:00");

    const endInput = screen.getByLabelText(/Fim/i) as HTMLInputElement;
    expect(endInput.value).toBe("16:00");
  });

  test("3. Contador e limite do campo Finalidade", async () => {
    await renderBookingSheet({
      open: true,
      initialSlot: { date: "2026-11-20", start: "08:00", end: "09:50" },
    });

    const purposeInput = screen.getByLabelText(/Finalidade/i) as HTMLInputElement;
    expect(screen.getByText("0/120")).toBeDefined();

    fireEvent.change(purposeInput, { target: { value: "Reunião de departamento" } });
    expect(screen.getByText("23/120")).toBeDefined();
    expect(purposeInput.maxLength).toBe(120);
  });

  test("4. Atalhos de bloco atualizam horários e marcam botão ativo", async () => {
    await renderBookingSheet({
      open: true,
      initialSlot: { date: "2026-11-20", start: "08:00", end: "09:50" },
    });

    const startInput = screen.getByLabelText(/Início/i) as HTMLInputElement;
    const endInput = screen.getByLabelText(/Fim/i) as HTMLInputElement;

    // Inicialmente M12 deve estar ativo
    const m12Chip = screen.getByRole("button", { name: /^M12/i });
    expect(m12Chip.getAttribute("aria-pressed")).toBe("true");

    // Clica no chip T12 (13:30–15:20)
    const t12Chip = screen.getByRole("button", { name: /^T12/i });
    fireEvent.click(t12Chip);

    expect(startInput.value).toBe("13:30");
    expect(endInput.value).toBe("15:20");
    expect(t12Chip.getAttribute("aria-pressed")).toBe("true");
    expect(m12Chip.getAttribute("aria-pressed")).toBe("false");

    // Clica no chip N123 (19:00–22:00)
    const n123Chip = screen.getByRole("button", { name: /^N123/i });
    fireEvent.click(n123Chip);

    expect(startInput.value).toBe("19:00");
    expect(endInput.value).toBe("22:00");
    expect(n123Chip.getAttribute("aria-pressed")).toBe("true");
  });

  test("5. Contém classes responsivas de bottom-sheet móvel e modal desktop", async () => {
    await renderBookingSheet({ open: true });
    const dialog = screen.getByRole("dialog");

    expect(dialog.className).toContain("inset-x-0 bottom-0");
    expect(dialog.className).toContain("rounded-t-2xl");
    expect(dialog.className).toContain("sm:max-w-lg");
    expect(dialog.className).toContain("sm:rounded-2xl");
  });

  test("6. Validação: rejeita finalidade vazia sem disparar ação no servidor", async () => {
    const mockCreate = mock(async () => ({ ok: true as const, data: {} as BookingView }));
    await renderBookingSheet({
      open: true,
      initialSlot: { date: "2026-11-20", start: "08:00", end: "09:50" },
      createFn: mockCreate,
    });

    const submitBtn = screen.getByRole("button", { name: "Reservar" });
    fireEvent.click(submitBtn);

    expect(screen.getAllByRole("alert").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Informe a finalidade da reserva/i).length).toBeGreaterThan(0);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test("7. Validação: rejeita término anterior ou igual ao início", async () => {
    const mockCreate = mock(async () => ({ ok: true as const, data: {} as BookingView }));
    await renderBookingSheet({
      open: true,
      initialSlot: { date: "2026-11-20", start: "10:00", end: "09:00" },
      createFn: mockCreate,
    });

    const purposeInput = screen.getByLabelText(/Finalidade/i);
    fireEvent.change(purposeInput, { target: { value: "Reunião" } });

    const submitBtn = screen.getByRole("button", { name: "Reservar" });
    fireEvent.click(submitBtn);

    expect(screen.getAllByRole("alert").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/depois do início/i).length).toBeGreaterThan(0);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test("8. Validação: rejeita horário fora do expediente (06:00 às 23:00)", async () => {
    const mockCreate = mock(async () => ({ ok: true as const, data: {} as BookingView }));
    await renderBookingSheet({
      open: true,
      initialSlot: { date: "2026-11-20", start: "05:00", end: "07:00" },
      createFn: mockCreate,
    });

    const purposeInput = screen.getByLabelText(/Finalidade/i);
    fireEvent.change(purposeInput, { target: { value: "Reunião" } });

    const submitBtn = screen.getByRole("button", { name: "Reservar" });
    fireEvent.click(submitBtn);

    expect(screen.getAllByRole("alert").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/06:00/i).length).toBeGreaterThan(0);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test("9. Validação: rejeita reserva no passado", async () => {
    const mockCreate = mock(async () => ({ ok: true as const, data: {} as BookingView }));
    await renderBookingSheet({
      open: true,
      initialSlot: { date: "2020-01-01", start: "08:00", end: "10:00" },
      createFn: mockCreate,
    });

    const purposeInput = screen.getByLabelText(/Finalidade/i);
    fireEvent.change(purposeInput, { target: { value: "Passado" } });

    const submitBtn = screen.getByRole("button", { name: "Reservar" });
    fireEvent.click(submitBtn);

    expect(screen.getAllByRole("alert").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/passado/i).length).toBeGreaterThan(0);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test("10. Envio com sucesso: chama createFn e renderiza tela de confirmação", async () => {
    const createdBooking: BookingView = {
      id: "booking-99",
      spaceId: "space-adm",
      date: "2026-11-20",
      start: "08:00",
      end: "09:50",
      title: "Planejamento Semestral",
    };

    const mockCreate = mock(async () => ({
      ok: true as const,
      data: createdBooking,
    }));
    const mockSuccess = mock(() => {});

    await renderBookingSheet({
      open: true,
      initialSlot: {
        spaceId: "space-adm",
        date: "2026-11-20",
        start: "08:00",
        end: "09:50",
      },
      createFn: mockCreate,
      onSuccess: mockSuccess,
    });

    const purposeInput = screen.getByLabelText(/Finalidade/i);
    fireEvent.change(purposeInput, { target: { value: "Planejamento Semestral" } });

    const submitBtn = screen.getByRole("button", { name: "Reservar" });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    expect(mockCreate.mock.calls[0]?.[0]).toEqual({
      data: {
        spaceId: "space-adm",
        date: "2026-11-20",
        start: "08:00",
        end: "09:50",
        purpose: "Planejamento Semestral",
      },
    });

    expect(mockSuccess).toHaveBeenCalledWith(createdBooking);

    // Confirmação na tela
    const successView = await screen.findByTestId("booking-success-view");
    expect(within(successView).getByRole("heading", { name: "Reserva confirmada" })).toBeDefined();
    expect(within(successView).getByText("Seu horário está garantido.")).toBeDefined();
    expect(within(successView).getByText("Planejamento Semestral")).toBeDefined();
    expect(within(successView).getByText("ADM 2")).toBeDefined();
  });

  test("11. Conflito 409: exibe detalhes da ocupação conflitante em alerta inline", async () => {
    const conflictMessage = "Conflita com Física III — ADM 2, 08:00–09:50.";
    const mockCreate = mock(async () => ({
      ok: false as const,
      status: 409 as const,
      message: conflictMessage,
    }));

    await renderBookingSheet({
      open: true,
      initialSlot: {
        spaceId: "space-adm",
        date: "2026-11-20",
        start: "08:00",
        end: "09:50",
      },
      createFn: mockCreate,
    });

    const purposeInput = screen.getByLabelText(/Finalidade/i);
    fireEvent.change(purposeInput, { target: { value: "Aula extra" } });

    const submitBtn = screen.getByRole("button", { name: "Reservar" });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalled();
    });

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(conflictMessage);
    // Permanece no formulário para correção
    expect(screen.queryByTestId("booking-success-view")).toBeNull();
  });

  test("12. Confirmação: botão 'Fechar' fecha o modal", async () => {
    const mockCreate = mock(async () => ({
      ok: true as const,
      data: {
        id: "b-1",
        spaceId: "space-adm",
        date: "2026-11-20",
        start: "08:00",
        end: "09:50",
        title: "Reunião",
      },
    }));

    const { onOpenChange } = await renderBookingSheet({
      open: true,
      initialSlot: { date: "2026-11-20", start: "08:00", end: "09:50" },
      createFn: mockCreate,
    });

    fireEvent.change(screen.getByLabelText(/Finalidade/i), { target: { value: "Reunião" } });
    fireEvent.click(screen.getByRole("button", { name: "Reservar" }));

    const successView = await screen.findByTestId("booking-success-view");

    const closeBtn = within(successView).getByRole("button", { name: "Fechar" });
    fireEvent.click(closeBtn);

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  test("13. Confirmação: link 'Ver reserva' aponta para /minhas-reservas?newId=b-1", async () => {
    const mockCreate = mock(async () => ({
      ok: true as const,
      data: {
        id: "b-999",
        spaceId: "space-adm",
        date: "2026-11-20",
        start: "08:00",
        end: "09:50",
        title: "Reunião Especial",
      },
    }));

    await renderBookingSheet({
      open: true,
      initialSlot: { date: "2026-11-20", start: "08:00", end: "09:50" },
      createFn: mockCreate,
    });

    fireEvent.change(screen.getByLabelText(/Finalidade/i), {
      target: { value: "Reunião Especial" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Reservar" }));

    await screen.findByTestId("booking-success-view");

    const link = screen.getByRole("link", { name: "Ver reserva" }) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toContain("/minhas-reservas");
    expect(link.getAttribute("href")).toContain("newId=b-999");
  });

  test("14. TIMETABLE_SHORTCUTS possui os 7 blocos padrão do IFSC", () => {
    expect(TIMETABLE_SHORTCUTS).toHaveLength(7);
    const keys = TIMETABLE_SHORTCUTS.map((s) => s.key);
    expect(keys).toEqual(["M12", "M34", "T12", "T34", "N12", "N34", "N123"]);
  });
});
