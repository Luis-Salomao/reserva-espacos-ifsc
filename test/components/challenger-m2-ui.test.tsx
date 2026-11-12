import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { BookingView, MyBooking } from "#/application/bookings";
import {
  BookingSheet,
  type BookingSheetProps,
  TIMETABLE_SHORTCUTS,
} from "#/components/agenda/booking-sheet";
import { CancelDialog, type CancelTarget } from "#/components/agenda/cancel-dialog";
import { DEFAULT_HOURS, validateBookingWhen } from "#/domain/availability";
import type { Space } from "#/domain/space";
import type { User } from "#/domain/user";
import {
  MinhasReservasList,
  Route as MinhasReservasRoute,
  validateMinhasReservasSearch,
} from "#/routes/minhas-reservas";
import type { SessionInfo } from "#/server/session";

const MOCK_SPACES: Space[] = [
  { id: "space-adm", name: "ADM 2 — Administração", capacity: 30 },
  { id: "space-lab", name: "LAB 1 — Informática", capacity: 20 },
];

const MOCK_USER_DOCENTE: User = {
  id: "u-doc-1",
  name: "Prof. Marina Soares",
  email: "marina@ifsc.edu.br",
  code: "MSOAR",
  roles: ["docente"],
  active: true,
  placeholder: false,
};

const MOCK_USER_ADMIN: User = {
  id: "u-adm-1",
  name: "Admin Geral",
  email: "admin@ifsc.edu.br",
  code: "ADMIN",
  roles: ["admin"],
  active: true,
  placeholder: false,
};

const MOCK_USER_HORARIOS: User = {
  id: "u-hor-1",
  name: "Coordenador de Horários",
  email: "horarios@ifsc.edu.br",
  code: "HORAR",
  roles: ["horarios"],
  active: true,
  placeholder: false,
};

afterEach(() => {
  cleanup();
});

async function renderWithRouter(ui: React.ReactElement) {
  const root = createRootRoute({ component: () => ui });
  const home = createRoute({
    getParentRoute: () => root,
    path: "/",
    component: () => <div data-testid="agenda-home">Agenda Home</div>,
  });
  const router = createRouter({
    routeTree: root.addChildren([home]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  return render(<RouterProvider router={router} />);
}

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
  const renderResult = render(<RouterProvider router={router} />);
  if (props.open !== false) {
    await screen.findByRole("dialog");
  }
  return { ...renderResult, router, onOpenChange };
}

describe("Challenger M2: UI Responsiveness & Edge Cases", () => {
  /* ==========================================================================
     Suite 1: Mobile Viewport Responsiveness (RNF-01: 360px viewport width)
     ========================================================================== */
  describe("Suite 1: Mobile Viewport Responsiveness (RNF-01 360px)", () => {
    beforeEach(() => {
      Object.defineProperty(window, "innerWidth", {
        writable: true,
        configurable: true,
        value: 360,
      });
    });

    test("1.1 BookingSheet: classes de container garantem bottom-sheet móvel sem overflow horizontal em 360px", async () => {
      await renderBookingSheet({
        open: true,
        initialSlot: { date: "2026-11-20", start: "08:00", end: "09:50" },
      });

      const dialog = screen.getByRole("dialog");
      expect(dialog).toBeDefined();

      // Mobile bottom-sheet layout: inset-x-0 bottom-0 max-h-[90vh] overflow-y-auto
      expect(dialog.className).toContain("inset-x-0");
      expect(dialog.className).toContain("bottom-0");
      expect(dialog.className).toContain("max-h-[90vh]");
      expect(dialog.className).toContain("overflow-y-auto");
      expect(dialog.className).toContain("rounded-t-2xl");

      // Desktop layout classes are prefixed with sm:
      expect(dialog.className).toContain("sm:max-w-lg");
      expect(dialog.className).toContain("sm:rounded-2xl");

      // Verify no hardcoded fixed width exceeding 360px exists in the dialog hierarchy
      const elementsWithWidth = dialog.querySelectorAll<HTMLElement>("*");
      for (const el of elementsWithWidth) {
        const cls = el.className;
        if (typeof cls === "string") {
          const matches = cls.match(/(?:w|min-w)-\[(\d+)px\]/g);
          if (matches) {
            for (const m of matches) {
              const num = Number.parseInt(m.replace(/\D/g, ""), 10);
              expect(num).toBeLessThanOrEqual(360);
            }
          }
        }
      }
    });

    test("1.2 BookingSheet: possui handle visual exclusivo para mobile e atalhos com flex-wrap", async () => {
      await renderBookingSheet({
        open: true,
        initialSlot: { date: "2026-11-20", start: "08:00", end: "09:50" },
      });

      const dialog = screen.getByRole("dialog");

      // Visual handle with aria-hidden and sm:hidden
      const handle = dialog.querySelector(".sm\\:hidden");
      expect(handle).not.toBeNull();
      expect(handle?.getAttribute("aria-hidden")).toBe("true");

      // Timetable shortcut chips container uses flex-wrap so it wraps nicely on 360px
      const fieldset = screen.getByRole("group", { name: "Horários rápidos" });
      expect(fieldset).toBeDefined();
      const wrapContainer = fieldset.querySelector("div");
      expect(wrapContainer?.className).toContain("flex-wrap");
    });

    test("1.3 BookingSheet: tela de sucesso possui layout vertical e botões empilhados em mobile", async () => {
      const mockSuccess: BookingView = {
        id: "b-resp-1",
        spaceId: "space-adm",
        date: "2026-11-20",
        start: "08:00",
        end: "09:50",
        title: "Reunião Departamental Longa para Teste de Quebra de Linha em 360px",
      };

      await renderBookingSheet({
        open: true,
        initialSlot: { date: "2026-11-20", start: "08:00", end: "09:50" },
        createFn: mock(async (..._args: unknown[]) => ({ ok: true as const, data: mockSuccess })),
      });

      const purposeInput = screen.getByLabelText(/Matéria ou título/i);
      fireEvent.change(purposeInput, { target: { value: "Reunião Departamental Longa" } });
      fireEvent.click(screen.getByRole("button", { name: "Reservar" }));

      await screen.findByTestId("booking-success-view");
      const successView = screen.getByTestId("booking-success-view");
      expect(successView).toBeDefined();

      // Actions footer in success view stacks on mobile
      const actions = successView.querySelector(".flex-col-reverse");
      expect(actions).not.toBeNull();
      expect(actions?.className).toContain("sm:flex-row");
    });

    test("1.4 CancelDialog: respeita viewport móvel e limita altura da prévia com overflow-y-auto", async () => {
      const target: CancelTarget = {
        id: "occ-series-1",
        date: "2026-11-10",
        start: "08:00",
        end: "09:50",
        title: "Programação Web I",
        source: "import",
        spaceName: "Laboratório 101",
      };

      const futureDates = Array.from({ length: 20 }, (_, i) => {
        const d = (i + 1).toString().padStart(2, "0");
        return `2026-12-${d}`;
      });

      render(
        <CancelDialog
          open={true}
          onOpenChange={mock((..._args: unknown[]) => {})}
          target={target}
          previewFn={mock(async (..._args: unknown[]) => ({
            ok: true as const,
            data: { dates: futureDates },
          }))}
        />,
      );

      // Dialog alert content has max-w-[calc(100%-2rem)] on mobile
      const dialogContent = screen.getByRole("alertdialog");
      expect(dialogContent).toBeDefined();
      expect(dialogContent.className).toContain("max-w-[calc(100%-2rem)]");

      // Switch to series scope
      const serieRadio = screen.getByLabelText(/Toda a série/i);
      fireEvent.click(serieRadio);

      // Verify series preview box rendered and has max-h-32 with overflow-y-auto
      await screen.findByTestId("series-preview-box");
      const previewBox = screen.getByTestId("series-preview-box");
      expect(previewBox).toBeDefined();

      const scrollableList = previewBox.querySelector(".max-h-32.overflow-y-auto");
      expect(scrollableList).not.toBeNull();
      const dateChips = scrollableList?.querySelectorAll("span");
      expect(dateChips?.length).toBe(20);
    });
  });

  /* ==========================================================================
     Suite 2: Route Guard Edge Cases (/minhas-reservas)
     ========================================================================== */
  describe("Suite 2: Route Guard & Search Edge Cases (/minhas-reservas)", () => {
    test("2.1 validateMinhasReservasSearch: trata entradas malformadas, vazias e não-string", () => {
      // Empty string or whitespace
      expect(validateMinhasReservasSearch({ newId: "" })).toEqual({});
      expect(validateMinhasReservasSearch({ newId: "   " })).toEqual({});
      expect(validateMinhasReservasSearch({ newId: "\t\n  " })).toEqual({});

      // Valid string trimmed
      expect(validateMinhasReservasSearch({ newId: "  b-100  " })).toEqual({ newId: "b-100" });

      // Malformed non-string types
      expect(validateMinhasReservasSearch({ newId: 12345 })).toEqual({});
      expect(validateMinhasReservasSearch({ newId: true })).toEqual({});
      expect(validateMinhasReservasSearch({ newId: null })).toEqual({});
      expect(validateMinhasReservasSearch({ newId: undefined })).toEqual({});
      expect(validateMinhasReservasSearch({ newId: ["b-1", "b-2"] })).toEqual({});
      expect(validateMinhasReservasSearch({ newId: { id: "b-1" } })).toEqual({});

      // Special characters and XSS attempts are safely stored as sanitized strings
      expect(validateMinhasReservasSearch({ newId: "<script>alert(1)</script>" })).toEqual({
        newId: "<script>alert(1)</script>",
      });
      expect(validateMinhasReservasSearch({ newId: "' OR '1'='1" })).toEqual({
        newId: "' OR '1'='1",
      });
    });

    test("2.2 Route.beforeLoad: redireciona deslogado quando session.user === null", () => {
      const mockContext = {
        session: {
          user: null,
          publicRead: true,
          timeZone: "America/Sao_Paulo",
        } as SessionInfo,
      };

      expect(() => {
        // @ts-expect-error accessing route beforeLoad directly in test
        MinhasReservasRoute.options.beforeLoad({ context: mockContext });
      }).toThrow();
    });

    test("2.3 Route.beforeLoad: permite autenticado (docente, admin, horarios)", () => {
      for (const user of [MOCK_USER_DOCENTE, MOCK_USER_ADMIN, MOCK_USER_HORARIOS]) {
        const mockContext = {
          session: {
            user,
            publicRead: false,
            timeZone: "America/Sao_Paulo",
          } as SessionInfo,
        };

        let didThrow = false;
        try {
          // @ts-expect-error accessing route beforeLoad directly in test
          MinhasReservasRoute.options.beforeLoad({ context: mockContext });
        } catch {
          didThrow = true;
        }

        expect(didThrow).toBe(false);
      }
    });

    test("2.4 MinhasReservasList: estado vazio renderiza mensagem e link sem quebrar", async () => {
      await renderWithRouter(
        <MinhasReservasList items={[]} onSelectCancel={mock((..._args: unknown[]) => {})} />,
      );

      const emptyState = screen.getByText("Nenhuma reserva futura.");
      expect(emptyState).toBeDefined();
      expect(
        screen.getByText("Você não possui reservas ou aulas agendadas para os próximos dias."),
      ).toBeDefined();
      expect(screen.getByRole("link", { name: "Ver agenda" })).toBeDefined();
    });

    test("2.5 MinhasReservasList: newId inexistente ou vazio não destaca nenhum item indevidamente", async () => {
      const mockItems: MyBooking[] = [
        {
          id: "b-item-1",
          spaceId: "space-adm",
          spaceName: "ADM 2",
          date: "2026-11-25",
          start: "08:00",
          end: "09:50",
          title: "Reunião de Curso",
          source: "manual",
          status: "ativa",
          canCancel: true,
          mine: true,
          responsible: false,
          person: null,
          inSeries: false,
        },
      ];

      // Non-matching newId
      const { rerender } = await renderWithRouter(
        <MinhasReservasList
          items={mockItems}
          newId="non-matching-id"
          onSelectCancel={mock((..._args: unknown[]) => {})}
        />,
      );

      const card = screen.getByTestId("booking-card-b-item-1");
      expect(card.className).not.toContain("item-new");
      expect(screen.queryByText("Nova")).toBeNull();

      // Undefined newId
      rerender(
        <MinhasReservasList items={mockItems} onSelectCancel={mock((..._args: unknown[]) => {})} />,
      );
      expect(card.className).not.toContain("item-new");
      expect(screen.queryByText("Nova")).toBeNull();
    });
  });

  /* ==========================================================================
     Suite 3: Timetable Block Shortcuts & Boundary Conditions
     ========================================================================== */
  describe("Suite 3: Timetable Block Shortcuts & Boundary Conditions", () => {
    test("3.1 Atalhos padrão IFSC cobrem exatamente os 7 blocos esperados dentro do expediente", () => {
      expect(TIMETABLE_SHORTCUTS).toHaveLength(7);

      const keys = TIMETABLE_SHORTCUTS.map((s) => s.key);
      expect(keys).toEqual(["M12", "M34", "T12", "T34", "N12", "N34", "N123"]);

      for (const shortcut of TIMETABLE_SHORTCUTS) {
        expect(shortcut.start).toMatch(/^\d{2}:\d{2}$/);
        expect(shortcut.end).toMatch(/^\d{2}:\d{2}$/);
        expect(shortcut.end > shortcut.start).toBe(true);

        // Operating hours: 06:00 to 23:00
        expect(shortcut.start >= DEFAULT_HOURS.opens).toBe(true);
        expect(shortcut.end <= DEFAULT_HOURS.closes).toBe(true);
      }
    });

    test("3.2 Clicar em cada um dos 7 atalhos atualiza inputs e estado aria-pressed", async () => {
      await renderBookingSheet({
        open: true,
        initialSlot: { date: "2026-11-30", start: "06:00", end: "07:00" },
      });

      const startInput = screen.getByLabelText(/Início/i) as HTMLInputElement;
      const endInput = screen.getByLabelText(/Fim/i) as HTMLInputElement;

      for (const shortcut of TIMETABLE_SHORTCUTS) {
        const button = screen.getByRole("button", {
          name: new RegExp(`${shortcut.name.split(" ")[0]} · ${shortcut.start}–${shortcut.end}`),
        });
        fireEvent.click(button);

        expect(startInput.value).toBe(shortcut.start);
        expect(endInput.value).toBe(shortcut.end);
        expect(button.getAttribute("aria-pressed")).toBe("true");

        // Verify other shortcut buttons are NOT pressed
        for (const other of TIMETABLE_SHORTCUTS) {
          if (other.key !== shortcut.key) {
            const otherBtn = screen.getByRole("button", {
              name: new RegExp(`${other.name.split(" ")[0]} · ${other.start}–${other.end}`),
            });
            expect(otherBtn.getAttribute("aria-pressed")).toBe("false");
          }
        }
      }
    });

    test("3.3 Edição manual de horário desativa aria-pressed do atalho", async () => {
      await renderBookingSheet({
        open: true,
        initialSlot: { date: "2026-11-30", start: "08:00", end: "09:50" },
      });

      const m12Btn = screen.getByRole("button", { name: /Manhã · 08:00–09:50/ });
      expect(m12Btn.getAttribute("aria-pressed")).toBe("true");

      const startInput = screen.getByLabelText(/Início/i);
      fireEvent.change(startInput, { target: { value: "08:30" } });

      expect(m12Btn.getAttribute("aria-pressed")).toBe("false");
    });

    test("3.4 Clicar em atalho limpa mensagens de erro prévias de horário", async () => {
      await renderBookingSheet({
        open: true,
        initialSlot: { date: "2026-11-30", start: "14:00", end: "10:00" }, // end < start
      });

      // Attempt submit to trigger inline validation errors
      fireEvent.click(screen.getByRole("button", { name: "Reservar" }));
      await waitFor(() => {
        expect(
          screen.getAllByText("O fim deve ser depois do início.").length,
        ).toBeGreaterThanOrEqual(1);
      });

      // Click valid shortcut
      const t12Btn = screen.getByRole("button", { name: /Tarde · 13:30–15:20/ });
      fireEvent.click(t12Btn);

      // Error message should be cleared
      expect(screen.queryByText("O fim deve ser depois do início.")).toBeNull();
    });

    test("3.5 Validação contra limites de horário e reserva no passado via validateBookingWhen", () => {
      const frozenNow = "2026-11-10T14:00";

      // Date today, earlier shortcut (M12 08:00–09:50) is in past
      const pastIssue = validateBookingWhen(
        { date: "2026-11-10", start: "08:00", end: "09:50" },
        DEFAULT_HOURS,
        frozenNow,
      );
      expect(pastIssue).not.toBeNull();
      expect(pastIssue?.message).toBe("Não é possível reservar no passado.");

      // Date today, future shortcut (T34 15:40–17:30) is valid
      const futureIssue = validateBookingWhen(
        { date: "2026-11-10", start: "15:40", end: "17:30" },
        DEFAULT_HOURS,
        frozenNow,
      );
      expect(futureIssue).toBeNull();

      // Boundary: exact opening hours (06:00 to 23:00)
      expect(
        validateBookingWhen(
          { date: "2026-11-15", start: "06:00", end: "23:00" },
          DEFAULT_HOURS,
          frozenNow,
        ),
      ).toBeNull();

      // Boundary: before 06:00
      const earlyIssue = validateBookingWhen(
        { date: "2026-11-15", start: "05:50", end: "08:00" },
        DEFAULT_HOURS,
        frozenNow,
      );
      expect(earlyIssue?.message).toBe("O início deve ser a partir de 06:00.");

      // Boundary: after 23:00
      const lateIssue = validateBookingWhen(
        { date: "2026-11-15", start: "22:00", end: "23:10" },
        DEFAULT_HOURS,
        frozenNow,
      );
      expect(lateIssue?.message).toBe("O fim deve ser até 23:00.");
    });
  });

  /* ==========================================================================
     Suite 4: Input Sanitization & Purpose Field Stress
     ========================================================================== */
  describe("Suite 4: Input Sanitization & Purpose Field Stress", () => {
    test("4.1 Rejeita strings com somente espaços ou quebras de linha", async () => {
      const mockCreate = mock(async (..._args: unknown[]) => ({
        ok: true as const,
        data: {} as BookingView,
      }));

      await renderBookingSheet({
        open: true,
        initialSlot: { date: "2026-11-30", start: "08:00", end: "09:50" },
        createFn: mockCreate,
      });

      const purposeInput = screen.getByLabelText(/Matéria ou título/i);

      // Whitespace only
      fireEvent.change(purposeInput, { target: { value: "     " } });
      fireEvent.click(screen.getByRole("button", { name: "Reservar" }));

      await waitFor(() => {
        expect(screen.getAllByText("Informe a matéria ou o título").length).toBeGreaterThanOrEqual(
          1,
        );
      });
      expect(mockCreate).not.toHaveBeenCalled();

      // Tabs and newlines
      fireEvent.change(purposeInput, { target: { value: "\t\n  \r\n" } });
      fireEvent.click(screen.getByRole("button", { name: "Reservar" }));
      await waitFor(() => {
        expect(screen.getAllByText("Informe a matéria ou o título").length).toBeGreaterThanOrEqual(
          1,
        );
      });
      expect(mockCreate).not.toHaveBeenCalled();
    });

    test("4.2 Faz trim da finalidade válida antes de enviar ao servidor", async () => {
      const mockCreate = mock(
        async (payload: Parameters<NonNullable<BookingSheetProps["createFn"]>>[0]) => ({
          ok: true as const,
          data: {
            id: "b-trim-1",
            spaceId: payload.data.spaceId,
            date: payload.data.date,
            start: payload.data.start,
            end: payload.data.end,
            title: payload.data.purpose,
          } as BookingView,
        }),
      );

      await renderBookingSheet({
        open: true,
        initialSlot: { date: "2026-11-30", start: "08:00", end: "09:50" },
        createFn: mockCreate,
      });

      const purposeInput = screen.getByLabelText(/Matéria ou título/i);
      fireEvent.change(purposeInput, {
        target: { value: "   Reunião Pedagógica com Coordenadores   " },
      });
      fireEvent.click(screen.getByRole("button", { name: "Reservar" }));

      await waitFor(() => {
        expect(mockCreate).toHaveBeenCalledTimes(1);
      });

      const sentData = mockCreate.mock.calls[0]?.[0]?.data;
      if (sentData === undefined) throw new Error("A reserva não foi enviada.");
      expect(sentData.purpose).toBe("Reunião Pedagógica com Coordenadores");
    });

    test("4.3 Limites de tamanho da finalidade (1 char, 120 chars, 121 chars)", async () => {
      const mockCreate = mock(async (..._args: unknown[]) => ({
        ok: true as const,
        data: { id: "b-len-1" } as BookingView,
      }));

      await renderBookingSheet({
        open: true,
        initialSlot: { date: "2026-11-30", start: "08:00", end: "09:50" },
        createFn: mockCreate,
      });

      const purposeInput = screen.getByLabelText(/Matéria ou título/i) as HTMLInputElement;
      expect(purposeInput.maxLength).toBe(120);

      // Exactly 1 character
      fireEvent.change(purposeInput, { target: { value: "X" } });
      expect(screen.getByText("1/120")).toBeDefined();

      // Exactly 120 characters
      const exactly120 = "A".repeat(120);
      fireEvent.change(purposeInput, { target: { value: exactly120 } });
      expect(screen.getByText("120/120")).toBeDefined();

      // 121 characters (simulating paste or bypass)
      const over120 = "A".repeat(121);
      fireEvent.change(purposeInput, { target: { value: over120 } });
      fireEvent.click(screen.getByRole("button", { name: "Reservar" }));

      await waitFor(() => {
        expect(
          screen.getAllByText("A finalidade deve ter no máximo 120 caracteres.").length,
        ).toBeGreaterThanOrEqual(1);
      });
      expect(mockCreate).not.toHaveBeenCalled();
    });

    test("4.4 Strings adversariais (XSS, emojis, caracteres especiais) são tratadas com segurança", async () => {
      const payloadXSS = "<script>alert('xss')</script> & <b>bold</b> ' \" `";
      const mockCreate = mock(
        async (input: Parameters<NonNullable<BookingSheetProps["createFn"]>>[0]) => ({
          ok: true as const,
          data: {
            id: "b-xss-1",
            spaceId: input.data.spaceId,
            date: input.data.date,
            start: input.data.start,
            end: input.data.end,
            title: input.data.purpose,
          } as BookingView,
        }),
      );

      await renderBookingSheet({
        open: true,
        initialSlot: { date: "2026-11-30", start: "08:00", end: "09:50" },
        createFn: mockCreate,
      });

      const purposeInput = screen.getByLabelText(/Matéria ou título/i);
      fireEvent.change(purposeInput, { target: { value: payloadXSS } });
      fireEvent.click(screen.getByRole("button", { name: "Reservar" }));

      await screen.findByTestId("booking-success-view");

      // Verify the title is rendered as text and NOT executed or unescaped HTML
      const successView = screen.getByTestId("booking-success-view");
      expect(successView.textContent).toContain(payloadXSS);
      expect(document.querySelector("script")).toBeNull();
    });
  });
});
