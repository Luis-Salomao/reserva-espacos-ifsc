import { describe, expect, mock, test } from "bun:test";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { AgendaItem, BookingView, RoomDay, RoomsDay } from "#/application/bookings";
import {
  BookingSheet,
  type BookingSheetProps,
  TIMETABLE_SHORTCUTS,
} from "#/components/agenda/booking-sheet";
import type { SubjectsLoad } from "#/components/agenda/subject-combobox";
import type { Space } from "#/domain/space";
import { requireSelect } from "../dom-values";

const MOCK_SPACES: Space[] = [
  { id: "space-adm", name: "ADM 2", capacity: 30 },
  { id: "space-lab", name: "LAB 1", capacity: 20 },
];

const DAY_DATE = "2030-11-20";
const NEXT_DATE = "2030-11-21";
const ROOM_SPACES: Space[] = [
  ...MOCK_SPACES,
  { id: "space-aud", name: "Auditório", capacity: 120 },
];

function occupation(id: string, date: string, start: string, end: string, title: string) {
  return {
    id,
    date,
    start,
    end,
    title,
    source: "import",
    status: "ativa",
    canCancel: false,
    mine: false,
    person: { name: "Ana Souza", code: "ASOUZA", placeholder: false },
  } satisfies AgendaItem;
}

/** Trechos livres do expediente (06:00–23:00) fora das ocupações, em ordem. */
function roomDay(space: Space, date: string, occupations: AgendaItem[]): RoomDay {
  const free: Array<{ start: string; end: string }> = [];
  let cursor = "06:00";
  for (const item of occupations) {
    if (item.start > cursor) free.push({ start: cursor, end: item.start });
    cursor = item.end;
  }
  if (cursor < "23:00") free.push({ start: cursor, end: "23:00" });
  return {
    spaceId: space.id,
    date,
    now: "2030-11-01T08:00",
    hours: { opens: "06:00", closes: "23:00" },
    occupations,
    free,
    blocks: [],
    space: { id: space.id, name: space.name, capacity: space.capacity },
  };
}

const [ADM, LAB, AUD] = ROOM_SPACES as [Space, Space, Space];

/** ADM 2 ocupada de manhã, Auditório à tarde, LAB 1 livre; no dia seguinte, LAB 1 ocupada de manhã. */
function dayOf(date: string): RoomsDay {
  const rooms =
    date === DAY_DATE
      ? [
          roomDay(ADM, date, [occupation("o1", date, "08:00", "09:50", "Física III")]),
          roomDay(LAB, date, []),
          roomDay(AUD, date, [occupation("o2", date, "13:30", "15:20", "Colação")]),
        ]
      : [
          roomDay(ADM, date, []),
          roomDay(LAB, date, [occupation("o3", date, "07:30", "10:00", "Química")]),
          roomDay(AUD, date, []),
        ];
  return { date, now: "2030-11-01T08:00", rooms };
}

function availabilityMock() {
  return mock(async (input: { data: { date: string } }) => ({
    ok: true as const,
    data: dayOf(input.data.date),
  }));
}

const roomSelect = () => requireSelect(screen.getByLabelText("Sala"));

/** Rótulos das opções de cada grupo, na ordem da tela. */
function groupsOf(select: HTMLSelectElement) {
  return Array.from(select.querySelectorAll("optgroup")).map((group) => ({
    label: group.label,
    options: Array.from(group.querySelectorAll("option")).map((option) => ({
      text: option.textContent,
      disabled: option.disabled,
    })),
  }));
}

const SUBJECTS: SubjectsLoad = async () => ({ ok: true, data: { mine: [], all: [] } });

async function renderBookingSheet(props: Partial<BookingSheetProps> = {}) {
  const onOpenChange = props.onOpenChange ?? mock((..._args: unknown[]) => {});
  const root = createRootRoute({
    component: () => (
      <BookingSheet
        open={props.open ?? true}
        onOpenChange={onOpenChange}
        spaces={props.spaces ?? MOCK_SPACES}
        {...(props.initialSlot === undefined ? {} : { initialSlot: props.initialSlot })}
        timeZone={props.timeZone ?? "America/Sao_Paulo"}
        {...(props.onSuccess === undefined ? {} : { onSuccess: props.onSuccess })}
        {...(props.createFn === undefined ? {} : { createFn: props.createFn })}
        {...(props.availability === undefined ? {} : { availability: props.availability })}
        subjectsFn={props.subjectsFn ?? SUBJECTS}
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

    const roomSelect = requireSelect(screen.getByLabelText(/Sala/i));
    expect(roomSelect.value).toBe("space-lab");

    const dateInput = screen.getByLabelText(/Data/i) as HTMLInputElement;
    expect(dateInput.value).toBe("2026-11-20");

    const startInput = screen.getByLabelText(/Início/i) as HTMLInputElement;
    expect(startInput.value).toBe("14:00");

    const endInput = screen.getByLabelText(/Fim/i) as HTMLInputElement;
    expect(endInput.value).toBe("16:00");
  });

  test("Data vem antes de Sala e o seletor respeita o tema claro e escuro", async () => {
    await renderBookingSheet({ open: true });

    const dateInput = screen.getByLabelText("Data");
    const select = roomSelect();
    expect(dateInput.compareDocumentPosition(select) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(select.className).toContain("bg-background");
    expect(select.className).toContain("text-foreground");
    expect(select.className).toContain("[color-scheme:light]");
    expect(select.className).toContain("dark:bg-input");
    expect(select.className).toContain("dark:[color-scheme:dark]");
  });

  test("3. Contador e limite do campo Finalidade", async () => {
    await renderBookingSheet({
      open: true,
      initialSlot: { date: "2026-11-20", start: "08:00", end: "09:50" },
    });

    const purposeInput = screen.getByLabelText(/Matéria ou título/) as HTMLInputElement;
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
    const m12Chip = screen.getByRole("button", { name: /Manh. .*08:00/i });
    expect(m12Chip.getAttribute("aria-pressed")).toBe("true");

    // Clica no chip T12 (13:30–15:20)
    const t12Chip = screen.getByRole("button", { name: /Tarde .*13:30/i });
    fireEvent.click(t12Chip);

    expect(startInput.value).toBe("13:30");
    expect(endInput.value).toBe("15:20");
    expect(t12Chip.getAttribute("aria-pressed")).toBe("true");
    expect(m12Chip.getAttribute("aria-pressed")).toBe("false");

    // Clica no chip N123 (19:00–22:00)
    const n123Chip = screen.getByRole("button", { name: /Noite .*19:00/i });
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
    const mockCreate = mock(async (..._args: unknown[]) => ({
      ok: true as const,
      data: {} as BookingView,
    }));
    await renderBookingSheet({
      open: true,
      initialSlot: { date: "2026-11-20", start: "08:00", end: "09:50" },
      createFn: mockCreate,
    });

    const submitBtn = screen.getByRole("button", { name: "Reservar" });
    fireEvent.click(submitBtn);

    expect(screen.getAllByRole("alert").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Informe a matéria ou o título").length).toBeGreaterThan(0);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test("7. Validação: rejeita término anterior ou igual ao início", async () => {
    const mockCreate = mock(async (..._args: unknown[]) => ({
      ok: true as const,
      data: {} as BookingView,
    }));
    await renderBookingSheet({
      open: true,
      initialSlot: { date: "2026-11-20", start: "10:00", end: "09:00" },
      createFn: mockCreate,
    });

    const purposeInput = screen.getByLabelText(/Matéria ou título/);
    fireEvent.change(purposeInput, { target: { value: "Reunião" } });

    const submitBtn = screen.getByRole("button", { name: "Reservar" });
    fireEvent.click(submitBtn);

    expect(screen.getAllByRole("alert").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/depois do início/i).length).toBeGreaterThan(0);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test("8. Validação: rejeita horário fora do expediente (06:00 às 23:00)", async () => {
    const mockCreate = mock(async (..._args: unknown[]) => ({
      ok: true as const,
      data: {} as BookingView,
    }));
    await renderBookingSheet({
      open: true,
      initialSlot: { date: "2026-11-20", start: "05:00", end: "07:00" },
      createFn: mockCreate,
    });

    const purposeInput = screen.getByLabelText(/Matéria ou título/);
    fireEvent.change(purposeInput, { target: { value: "Reunião" } });

    const submitBtn = screen.getByRole("button", { name: "Reservar" });
    fireEvent.click(submitBtn);

    expect(screen.getAllByRole("alert").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/06:00/i).length).toBeGreaterThan(0);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test("9. Validação: rejeita reserva no passado", async () => {
    const mockCreate = mock(async (..._args: unknown[]) => ({
      ok: true as const,
      data: {} as BookingView,
    }));
    await renderBookingSheet({
      open: true,
      initialSlot: { date: "2020-01-01", start: "08:00", end: "10:00" },
      createFn: mockCreate,
    });

    const purposeInput = screen.getByLabelText(/Matéria ou título/);
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

    const mockCreate = mock(async (..._args: unknown[]) => ({
      ok: true as const,
      data: createdBooking,
    }));
    const mockSuccess = mock((..._args: unknown[]) => {});

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

    const purposeInput = screen.getByLabelText(/Matéria ou título/);
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
    const mockCreate = mock(async (..._args: unknown[]) => ({
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

    const purposeInput = screen.getByLabelText(/Matéria ou título/);
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
    const mockCreate = mock(async (..._args: unknown[]) => ({
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

    fireEvent.change(screen.getByLabelText(/Matéria ou título/), { target: { value: "Reunião" } });
    fireEvent.click(screen.getByRole("button", { name: "Reservar" }));

    const successView = await screen.findByTestId("booking-success-view");

    const closeBtn = within(successView).getByRole("button", { name: "Fechar" });
    fireEvent.click(closeBtn);

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  test("13. Confirmação: link 'Ver reserva' aponta para /minhas-reservas?newId=b-1", async () => {
    const mockCreate = mock(async (..._args: unknown[]) => ({
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

    fireEvent.change(screen.getByLabelText(/Matéria ou título/), {
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

describe("BookingSheet — sala por disponibilidade (GERAL-12)", () => {
  test("com disponibilidade, livres antes das ocupadas e a ocupada desabilitada com o motivo", async () => {
    const availability = availabilityMock();
    await renderBookingSheet({
      spaces: ROOM_SPACES,
      initialSlot: { spaceId: "space-lab", date: DAY_DATE, start: "08:00", end: "09:50" },
      availability,
    });

    await waitFor(() => expect(groupsOf(roomSelect())).toHaveLength(2));
    expect(availability.mock.calls[0]?.[0]).toEqual({ data: { date: DAY_DATE } });
    expect(groupsOf(roomSelect())).toEqual([
      {
        label: "Livres",
        options: [
          { text: "LAB 1", disabled: false },
          { text: "Auditório", disabled: false },
        ],
      },
      {
        label: "Ocupadas",
        options: [{ text: "ADM 2 — Física III, 08:00–09:50", disabled: true }],
      },
    ]);
    expect(roomSelect().value).toBe("space-lab");
  });

  test("trocar o horário reordena sem buscar de novo; trocar a data busca o novo dia", async () => {
    const availability = availabilityMock();
    await renderBookingSheet({
      spaces: ROOM_SPACES,
      initialSlot: { spaceId: "space-lab", date: DAY_DATE, start: "08:00", end: "09:50" },
      availability,
    });
    await waitFor(() => expect(groupsOf(roomSelect())).toHaveLength(2));

    fireEvent.click(screen.getByRole("button", { name: /Tarde .*13:30/i }));
    expect(groupsOf(roomSelect())).toEqual([
      {
        label: "Livres",
        options: [
          { text: "ADM 2", disabled: false },
          { text: "LAB 1", disabled: false },
        ],
      },
      {
        label: "Ocupadas",
        options: [{ text: "Auditório — Colação, 13:30–15:20", disabled: true }],
      },
    ]);
    expect(availability).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /Manh. .*08:00/i }));
    fireEvent.change(screen.getByLabelText(/Data/i), { target: { value: NEXT_DATE } });
    await waitFor(() =>
      expect(groupsOf(roomSelect())[1]?.options).toEqual([
        { text: "LAB 1 — Química, 07:30–10:00", disabled: true },
      ]),
    );
    expect(availability.mock.calls.at(-1)?.[0]).toEqual({ data: { date: NEXT_DATE } });
    expect(groupsOf(roomSelect())[0]?.options.map((option) => option.text)).toEqual([
      "ADM 2",
      "Auditório",
    ]);
  });

  test("o motivo não leva nome nem código de pessoa", async () => {
    await renderBookingSheet({
      spaces: ROOM_SPACES,
      initialSlot: { spaceId: "space-lab", date: DAY_DATE, start: "08:00", end: "09:50" },
      availability: availabilityMock(),
    });
    await waitFor(() => expect(groupsOf(roomSelect())).toHaveLength(2));
    const text = roomSelect().textContent ?? "";
    expect(text).not.toContain("Ana");
    expect(text).not.toContain("ASOUZA");
  });

  test("sem fonte, a lista é a simples de hoje, sem grupos e sem opção desabilitada", async () => {
    await renderBookingSheet({
      spaces: ROOM_SPACES,
      initialSlot: { spaceId: "space-lab", date: DAY_DATE, start: "08:00", end: "09:50" },
    });
    const select = roomSelect();
    expect(select.querySelector("optgroup") === null).toBe(true);
    expect(
      Array.from(select.options).map((option) => [option.textContent, option.disabled]),
    ).toEqual([
      ["ADM 2", false],
      ["LAB 1", false],
      ["Auditório", false],
    ]);
  });

  const failures: Array<[string, NonNullable<BookingSheetProps["availability"]>]> = [
    [
      "resposta de erro",
      async () => ({ ok: false as const, status: 403 as const, message: "Falhou" }),
    ],
    [
      "exceção",
      async () => {
        throw new Error("rede");
      },
    ],
  ];
  for (const [kind, failure] of failures) {
    test(`falha da fonte (${kind}) mantém a lista simples`, async () => {
      const availability = mock(failure);
      await renderBookingSheet({
        spaces: ROOM_SPACES,
        initialSlot: { spaceId: "space-lab", date: DAY_DATE, start: "08:00", end: "09:50" },
        availability,
      });
      await waitFor(() => expect(availability).toHaveBeenCalledTimes(1));
      await new Promise((resolve) => setTimeout(resolve, 0));
      const select = roomSelect();
      expect(select.querySelector("optgroup") === null).toBe(true);
      expect(Array.from(select.options).map((option) => option.disabled)).toEqual([
        false,
        false,
        false,
      ]);
      expect(screen.queryByRole("alert") === null).toBe(true);
    });
  }

  test("não envia a reserva quando a sala escolhida ficou ocupada no novo horário", async () => {
    const createFn = mock(async (..._args: unknown[]) => ({
      ok: true as const,
      data: {} as BookingView,
    }));
    await renderBookingSheet({
      spaces: ROOM_SPACES,
      initialSlot: { spaceId: "space-adm", date: DAY_DATE, start: "13:30", end: "15:20" },
      availability: availabilityMock(),
      createFn,
    });
    await waitFor(() => expect(groupsOf(roomSelect())).toHaveLength(2));

    fireEvent.click(screen.getByRole("button", { name: /Manh. .*08:00/i }));
    fireEvent.change(screen.getByLabelText(/Matéria ou título/), { target: { value: "Reunião" } });
    fireEvent.click(screen.getByRole("button", { name: "Reservar" }));

    expect(screen.getAllByText("Essa sala está ocupada nesse horário.").length).toBeGreaterThan(0);
    expect(createFn).not.toHaveBeenCalled();
  });
});

describe("BookingSheet: matéria ou título", () => {
  test("texto longo é recusado sem enviar e o campo vem depois de Repetir", async () => {
    const createFn = mock(async () => ({ ok: true as const, data: {} as BookingView }));
    await renderBookingSheet({
      initialSlot: { spaceId: "space-adm", date: "2026-11-20", start: "08:00", end: "09:50" },
      createFn,
    });
    const repeat = screen.getByRole("button", { name: /^Repetir/ });
    const field = screen.getByLabelText("Matéria ou título");
    expect(repeat.compareDocumentPosition(field) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );

    fireEvent.change(field, { target: { value: "a".repeat(121) } });
    fireEvent.click(screen.getByRole("button", { name: "Reservar" }));
    expect(
      screen.getAllByText("A finalidade deve ter no máximo 120 caracteres.").length,
    ).toBeGreaterThan(0);
    expect(createFn).not.toHaveBeenCalled();
  });

  test("a matéria escolhida na lista vai na reserva", async () => {
    const createFn = mock<NonNullable<BookingSheetProps["createFn"]>>(async () => ({
      ok: true as const,
      data: {
        id: "b-mat",
        spaceId: "space-adm",
        date: "2026-11-20",
        start: "08:00",
        end: "09:50",
        title: "Cálculo — 2B",
      },
    }));
    const subjectsFn = mock<SubjectsLoad>(async () => ({
      ok: true,
      data: { mine: ["Cálculo — 2B"], all: ["Química — 3C"] },
    }));
    await renderBookingSheet({
      initialSlot: { spaceId: "space-adm", date: "2026-11-20", start: "08:00", end: "09:50" },
      createFn,
      subjectsFn,
    });
    await waitFor(() => expect(subjectsFn).toHaveBeenCalledWith({ data: { date: "2026-11-20" } }));
    const field = screen.getByLabelText("Matéria ou título");
    fireEvent.focus(field);
    fireEvent.click(screen.getByRole("option", { name: "Cálculo — 2B" }));
    expect((field as HTMLInputElement).value).toBe("Cálculo — 2B");
    fireEvent.click(screen.getByRole("button", { name: "Reservar" }));
    await waitFor(() => expect(createFn).toHaveBeenCalledTimes(1));
    expect(createFn.mock.calls[0]?.[0]).toEqual({
      data: {
        spaceId: "space-adm",
        date: "2026-11-20",
        start: "08:00",
        end: "09:50",
        purpose: "Cálculo — 2B",
      },
    });
  });

  test("trocar a sala troca os equipamentos do formulário", async () => {
    await renderBookingSheet({
      spaces: [
        {
          id: "space-adm",
          name: "ADM 2",
          capacity: 30,
          equipment: { items: { projetor: 1 }, notes: "Lousa da ADM" },
        },
        {
          id: "space-lab",
          name: "LAB 1",
          capacity: 20,
          equipment: { items: { computadores: 8 }, notes: null },
        },
      ],
      initialSlot: { spaceId: "space-adm", date: "2026-11-20", start: "08:00", end: "09:50" },
    });
    expect(screen.getByText("Projetor")).toBeDefined();
    expect(screen.getByText("Lousa da ADM")).toBeDefined();
    fireEvent.change(screen.getByLabelText("Sala"), { target: { value: "space-lab" } });
    expect(screen.getByText("8 computadores")).toBeDefined();
    expect(screen.queryByText("Lousa da ADM") === null).toBe(true);
  });

  test("Esc fecha a lista e mantém a folha aberta", async () => {
    const onOpenChange = mock(() => {});
    const subjectsFn = mock<SubjectsLoad>(async () => ({
      ok: true,
      data: { mine: ["Cálculo — 2B"], all: [] },
    }));
    await renderBookingSheet({
      onOpenChange,
      initialSlot: { date: "2026-11-20", start: "08:00", end: "09:50" },
      subjectsFn,
    });
    await waitFor(() => expect(subjectsFn).toHaveBeenCalled());
    const field = screen.getByLabelText("Matéria ou título");
    fireEvent.focus(field);
    expect(screen.getByRole("listbox", { name: "Matérias" })).toBeDefined();
    fireEvent.keyDown(field, { key: "Escape" });
    expect(screen.queryByRole("listbox", { name: "Matérias" }) === null).toBe(true);
    expect(screen.getByRole("dialog")).toBeDefined();
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
