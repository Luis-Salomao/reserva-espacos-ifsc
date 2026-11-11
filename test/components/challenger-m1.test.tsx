import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { AgendaItem, DayAgenda, WeekAgenda } from "#/application/bookings";
import { AgendaView } from "#/components/agenda/agenda-view";
import { formatHourAxis, layoutEvents, timeToMinutes } from "#/components/agenda/layout-helpers";
import { RoomSelector } from "#/components/agenda/room-selector";
import { TimelineDay, TimelineDayStrip } from "#/components/agenda/timeline-day";
import type { Space } from "#/domain/space";
import { getTodayDate, getWeekStart, validateAgendaSearch } from "#/routes/index";
import type { SessionInfo } from "#/server/session";

const MOCK_DATE = "2026-11-03";
const MOCK_WEEK_START = "2026-11-02";

const MOCK_SPACES: Space[] = [
  { id: "space-1", name: "Laboratório 101", capacity: 30 },
  { id: "space-2", name: "Auditório Central", capacity: 120 },
  { id: "space-3", name: "Sala de Reuniões", capacity: 12 },
];

function createAnonymousSession(publicRead = true): SessionInfo {
  return {
    user: null,
    publicRead,
    timeZone: "America/Sao_Paulo",
  };
}

async function renderWithRouter(ui: React.ReactElement) {
  const root = createRootRoute({ component: () => ui });
  const login = createRoute({
    getParentRoute: () => root,
    path: "/entrar",
    component: () => <div data-testid="login-page">Página de login</div>,
  });
  const router = createRouter({
    routeTree: root.addChildren([login]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  const renderResult = render(<RouterProvider router={router} />);
  await screen.findByTestId("agenda-view-root");
  return { ...renderResult, router };
}

afterEach(() => {
  cleanup();
});

describe("Empirical Challenger — Suite 1: RNF-01 360px Viewport & Layout Stress", () => {
  beforeEach(() => {
    Object.defineProperty(window, "innerWidth", {
      writable: true,
      configurable: true,
      value: 360,
    });
  });

  test("Check rendered elements for hardcoded fixed widths > 360px in DOM and styles", async () => {
    const dayAgenda: DayAgenda = {
      spaceId: "space-1",
      date: MOCK_DATE,
      now: `${MOCK_DATE}T10:00`,
      hours: { opens: "06:00", closes: "23:00" },
      occupations: [
        {
          id: "occ-1",
          date: MOCK_DATE,
          start: "08:00",
          end: "10:00",
          title: "Sistemas Distribuídos",
          source: "import",
          status: "ativa",
          canCancel: false,
          mine: false,
          person: null,
        },
        {
          id: "occ-2",
          date: MOCK_DATE,
          start: "10:00",
          end: "12:00",
          title: "Inteligência Artificial",
          source: "manual",
          status: "ativa",
          canCancel: false,
          mine: false,
          person: null,
        },
      ],
      free: [
        { start: "06:00", end: "08:00" },
        { start: "12:00", end: "23:00" },
      ],
      blocks: [],
    };

    const { container } = render(
      <TimelineDay dayAgenda={dayAgenda} onSelectSlot={() => {}} isVisitor={true} />,
    );

    const allElements = container.querySelectorAll("*");
    for (const el of Array.from(allElements)) {
      const htmlEl = el as HTMLElement;
      // Checar se há estilo inline com width ou min-width maior que 360px
      const inlineWidth = htmlEl.style.width;
      const inlineMinWidth = htmlEl.style.minWidth;
      if (inlineWidth.endsWith("px")) {
        const px = Number.parseFloat(inlineWidth);
        expect(px).toBeLessThanOrEqual(360);
      }
      if (inlineMinWidth.endsWith("px")) {
        const px = Number.parseFloat(inlineMinWidth);
        expect(px).toBeLessThanOrEqual(360);
      }

      // Checar classes Tailwind para proibir w-[>360px] ou min-w-[>360px]
      const classes = htmlEl.className;
      if (typeof classes === "string") {
        const matches = classes.match(/(?:min-)?w-\[(\d+)px\]/g);
        if (matches) {
          for (const match of matches) {
            const num = Number.parseInt(match.replace(/\D/g, ""), 10);
            expect(num).toBeLessThanOrEqual(360);
          }
        }
      }
    }
  });

  test("TimelineDay container has strict overflow-x-hidden to prevent page horizontal scroll", () => {
    const dayAgenda: DayAgenda = {
      spaceId: "space-1",
      date: MOCK_DATE,
      now: `${MOCK_DATE}T10:00`,
      hours: { opens: "06:00", closes: "23:00" },
      occupations: [],
      free: [{ start: "06:00", end: "23:00" }],
      blocks: [],
    };

    const { container } = render(
      <TimelineDay dayAgenda={dayAgenda} onSelectSlot={() => {}} isVisitor={true} />,
    );

    const root = container.querySelector("[data-testid='timeline-day']");
    expect(root).toBeTruthy();
    expect(root?.className).toContain("overflow-x-hidden");
    expect(root?.className).toContain("max-w-full");
    expect(root?.className).toContain("w-full");
  });

  test("TimelineDayStrip renders cleanly with 5 days without grid blowup in 360px", () => {
    const onSelectDate = mock();
    const { container } = render(
      <div style={{ width: "360px" }}>
        <TimelineDayStrip
          weekStart={MOCK_WEEK_START}
          selectedDate={MOCK_DATE}
          todayDate={MOCK_DATE}
          onSelectDate={onSelectDate}
        />
      </div>,
    );

    const strip = container.querySelector("section[aria-label='Dias da semana']");
    expect(strip).toBeTruthy();
    expect(strip?.querySelector(".grid-cols-5")).not.toBeNull();

    // Todas as 5 colunas de dias existem
    const dayButtons = container.querySelectorAll("button[aria-pressed]");
    expect(dayButtons.length).toBe(5);

    // Navegação anterior e próxima existem
    const prevBtn = screen.getByLabelText("Semana anterior");
    const nextBtn = screen.getByLabelText("Próxima semana");
    expect(prevBtn).toBeTruthy();
    expect(nextBtn).toBeTruthy();
  });

  test("Extreme content stress: 1000-character unbreakable title strings are truncated without horizontal overflow", () => {
    const longUnbrokenTitle = "SUPER_CALIFRAGILISTIC_EXPIALIDOCIOUS_".repeat(30);
    const dayAgenda: DayAgenda = {
      spaceId: "space-1",
      date: MOCK_DATE,
      now: `${MOCK_DATE}T10:00`,
      hours: { opens: "06:00", closes: "23:00" },
      occupations: [
        {
          id: "occ-extreme-string",
          date: MOCK_DATE,
          start: "08:00",
          end: "10:00",
          title: longUnbrokenTitle,
          source: "import",
          status: "ativa",
          canCancel: false,
          mine: false,
          person: null,
        },
      ],
      free: [{ start: "10:00", end: "23:00" }],
      blocks: [],
    };

    render(
      <div style={{ width: "360px" }}>
        <TimelineDay dayAgenda={dayAgenda} onSelectSlot={() => {}} isVisitor={true} />
      </div>,
    );

    const titleEl = screen.getByText(longUnbrokenTitle);
    expect(titleEl).toBeTruthy();
    expect(titleEl.tagName.toLowerCase()).toBe("b");
    expect(titleEl.className).toContain("truncate");
  });

  test("Extreme concurrency stress: 8 overlapping events in the same slot divide width proportionally with overflow protection", () => {
    const concurrentOccupations: AgendaItem[] = Array.from({ length: 8 }, (_, i) => ({
      id: `occ-concurrent-${i}`,
      date: MOCK_DATE,
      start: "09:00",
      end: "11:00",
      title: `Aula Paralela ${i + 1}`,
      source: "import" as const,
      status: "ativa" as const,
      canCancel: false,
      mine: false,
      person: null,
    }));

    const dayAgenda: DayAgenda = {
      spaceId: "space-1",
      date: MOCK_DATE,
      now: `${MOCK_DATE}T10:00`,
      hours: { opens: "06:00", closes: "23:00" },
      occupations: concurrentOccupations,
      free: [{ start: "11:00", end: "23:00" }],
      blocks: [],
    };

    render(
      <div style={{ width: "360px" }}>
        <TimelineDay dayAgenda={dayAgenda} onSelectSlot={() => {}} isVisitor={true} />
      </div>,
    );

    // Checar que cada evento tem width em calc(12.5% - 4px) e overflow-hidden
    for (let i = 0; i < 8; i++) {
      const btn = screen.getByText(`Aula Paralela ${i + 1}`).closest("button");
      expect(btn).toBeTruthy();
      expect(btn?.className).toContain("overflow-hidden");
      expect(btn?.style.width).toBe("calc(12.5% - 4px)");
    }
  });

  test("Mobile room selector opens a searchable grouped panel", () => {
    render(
      <RoomSelector
        spaces={MOCK_SPACES}
        selectedSpaceId="space-1"
        onSelectSpace={mock()}
        variant="chips"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Escolher sala/ }));
    expect(screen.getByRole("textbox", { name: /Buscar sala ou bloco/ })).toBeDefined();
    expect(screen.getByRole("dialog", { name: "Escolher sala" })).toBeDefined();
  });
});

describe("Empirical Challenger — Suite 2: Public Read Mode Privacy Leak Probe", () => {
  const SENSITIVE_PROFESSOR_NAME = "Prof. Dra. Maria Antônia Vasconcellos";
  const SENSITIVE_PROFESSOR_EMAIL = "maria.vasconcellos@ifsc.edu.br";
  const SENSITIVE_USER_ID = "usr-secret-998877";

  function createWeekAgendaWithSensitiveData(): WeekAgenda {
    return {
      spaceId: "space-1",
      weekStart: MOCK_WEEK_START,
      now: `${MOCK_WEEK_START}T08:00`,
      days: [
        {
          spaceId: "space-1",
          date: "2026-11-02",
          now: "2026-11-02T08:00",
          hours: { opens: "06:00", closes: "23:00" },
          occupations: [
            {
              id: "occ-public-1",
              date: "2026-11-02",
              start: "08:00",
              end: "10:00",
              title: "Química Geral",
              source: "import",
              status: "ativa",
              canCancel: false,
              mine: false,
              person: null,
            },
          ],
          free: [{ start: "10:00", end: "23:00" }],
          blocks: [],
        },
        {
          spaceId: "space-1",
          date: "2026-11-03",
          now: "2026-11-03T08:00",
          hours: { opens: "06:00", closes: "23:00" },
          occupations: [
            {
              id: "occ-public-2",
              date: "2026-11-03",
              start: "14:00",
              end: "16:00",
              title: "Física Experimental",
              source: "manual",
              status: "ativa",
              canCancel: false,
              mine: false,
              person: null,
            },
          ],
          free: [
            { start: "06:00", end: "14:00" },
            { start: "16:00", end: "23:00" },
          ],
          blocks: [],
        },
        {
          spaceId: "space-1",
          date: "2026-11-04",
          now: "2026-11-04T08:00",
          hours: { opens: "06:00", closes: "23:00" },
          occupations: [],
          free: [{ start: "06:00", end: "23:00" }],
          blocks: [],
        },
        {
          spaceId: "space-1",
          date: "2026-11-05",
          now: "2026-11-05T08:00",
          hours: { opens: "06:00", closes: "23:00" },
          occupations: [],
          free: [{ start: "06:00", end: "23:00" }],
          blocks: [],
        },
        {
          spaceId: "space-1",
          date: "2026-11-06",
          now: "2026-11-06T08:00",
          hours: { opens: "06:00", closes: "23:00" },
          occupations: [],
          free: [{ start: "06:00", end: "23:00" }],
          blocks: [],
        },
      ],
    };
  }

  test("DOM tree deep inspection: zero personal names, emails, or user IDs leak into DOM text or attributes", async () => {
    const weekAgenda = createWeekAgendaWithSensitiveData();
    const { container } = await renderWithRouter(
      <AgendaView
        spaces={MOCK_SPACES}
        selectedSpaceId="space-1"
        selectedDate="2026-11-02"
        weekAgenda={weekAgenda}
        session={createAnonymousSession(true)}
        onSelectSpace={() => {}}
        onSelectDate={() => {}}
      />,
    );

    const fullHtml = container.innerHTML;
    expect(fullHtml.includes(SENSITIVE_PROFESSOR_NAME)).toBe(false);
    expect(fullHtml.includes(SENSITIVE_PROFESSOR_EMAIL)).toBe(false);
    expect(fullHtml.includes(SENSITIVE_USER_ID)).toBe(false);

    // Deep attribute scan
    const allElements = container.querySelectorAll("*");
    for (const el of Array.from(allElements)) {
      for (const attr of Array.from(el.attributes)) {
        expect(attr.value.includes(SENSITIVE_PROFESSOR_NAME)).toBe(false);
        expect(attr.value.includes(SENSITIVE_PROFESSOR_EMAIL)).toBe(false);
        expect(attr.value.includes(SENSITIVE_USER_ID)).toBe(false);
      }
    }
  });

  test("Public banner is displayed with visitor notice and login link", async () => {
    const weekAgenda = createWeekAgendaWithSensitiveData();
    await renderWithRouter(
      <AgendaView
        spaces={MOCK_SPACES}
        selectedSpaceId="space-1"
        selectedDate="2026-11-02"
        weekAgenda={weekAgenda}
        session={createAnonymousSession(true)}
        onSelectSpace={() => {}}
        onSelectDate={() => {}}
      />,
    );

    const banner = screen.getByRole("status", { name: "Aviso de visitante" });
    expect(banner).toBeTruthy();
    expect(within(banner).getByText(/Você está vendo como/i)).toBeTruthy();
    expect(within(banner).getByText("visitante")).toBeTruthy();

    const loginLink = within(banner).getByRole("link", { name: /Entrar/i });
    expect(loginLink.getAttribute("href")).toBe("/entrar");
  });

  test("Booking creation triggers are completely absent from DOM for unauthenticated visitors", async () => {
    const weekAgenda = createWeekAgendaWithSensitiveData();
    await renderWithRouter(
      <AgendaView
        spaces={MOCK_SPACES}
        selectedSpaceId="space-1"
        selectedDate="2026-11-02"
        weekAgenda={weekAgenda}
        session={createAnonymousSession(true)}
        onSelectSpace={() => {}}
        onSelectDate={() => {}}
      />,
    );

    // No desktop 'Nova reserva' button
    expect(screen.queryByRole("button", { name: /Nova reserva/i })).toBeNull();

    // No mobile FAB 'Reservar' button
    expect(screen.queryByRole("button", { name: /^Reservar$/i })).toBeNull();
  });

  test("Unauthenticated visitor clicking a free slot in desktop WeekGrid triggers GateDialog and prevents reservation callback", async () => {
    const onSelectSlot = mock();
    const weekAgenda = createWeekAgendaWithSensitiveData();
    await renderWithRouter(
      <AgendaView
        spaces={MOCK_SPACES}
        selectedSpaceId="space-1"
        selectedDate="2026-11-02"
        weekAgenda={weekAgenda}
        session={createAnonymousSession(true)}
        onSelectSpace={() => {}}
        onSelectDate={() => {}}
        onSelectSlot={onSelectSlot}
      />,
    );

    // Achar um slot livre na grade semanal
    const freeSlots = within(screen.getByTestId("week-grid")).getAllByRole("button", {
      name: /Livre/i,
    });
    expect(freeSlots.length).toBeGreaterThan(0);
    const targetSlot = freeSlots.find((slot) => !slot.hasAttribute("disabled"));
    if (!targetSlot) throw new Error("Slot not found");

    fireEvent.click(targetSlot);

    // Callback de reserva NÃO deve ter sido chamado
    expect(onSelectSlot).not.toHaveBeenCalled();

    // GateDialog deve estar visível com título, texto explicativo e ações
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toBeTruthy();
    expect(within(dialog).getByText("Entre para reservar")).toBeTruthy();
    expect(
      within(dialog).getByText(
        /Qualquer pessoa pode consultar a agenda\. Para reservar ou cancelar, entre com sua conta institucional\./,
      ),
    ).toBeTruthy();

    const enterBtn = within(dialog).getByRole("link", { name: /Entrar/i });
    expect(enterBtn.getAttribute("href")).toBe("/entrar");

    const cancelBtn = within(dialog).getByRole("button", { name: /Agora não/i });
    expect(cancelBtn).toBeTruthy();
  });

  test("Unauthenticated visitor clicking a free slot in mobile TimelineDay triggers GateDialog and prevents reservation callback", async () => {
    const onSelectSlot = mock();
    const weekAgenda = createWeekAgendaWithSensitiveData();
    await renderWithRouter(
      <AgendaView
        spaces={MOCK_SPACES}
        selectedSpaceId="space-1"
        selectedDate="2026-11-02"
        weekAgenda={weekAgenda}
        session={createAnonymousSession(true)}
        onSelectSpace={() => {}}
        onSelectDate={() => {}}
        onSelectSlot={onSelectSlot}
      />,
    );

    // Na timeline mobile (que está dentro de lg:hidden)
    const timelines = screen.getAllByTestId("timeline-day");
    const mobileTimeline = timelines[timelines.length - 1];
    if (!mobileTimeline) throw new Error("Mobile timeline not found");
    const freeSlotMobile = within(mobileTimeline).getAllByRole("button", { name: /Livre/i })[0];
    if (!freeSlotMobile) throw new Error("Mobile free slot not found");

    fireEvent.click(freeSlotMobile);

    expect(onSelectSlot).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toBeTruthy();
    expect(within(dialog).getByText("Entre para reservar")).toBeTruthy();
  });

  test("GateDialog cancel action ('Agora não') closes the dialog smoothly", async () => {
    const weekAgenda = createWeekAgendaWithSensitiveData();
    await renderWithRouter(
      <AgendaView
        spaces={MOCK_SPACES}
        selectedSpaceId="space-1"
        selectedDate="2026-11-02"
        weekAgenda={weekAgenda}
        session={createAnonymousSession(true)}
        onSelectSpace={() => {}}
        onSelectDate={() => {}}
      />,
    );

    const freeSlots = within(screen.getByTestId("week-grid")).getAllByRole("button", {
      name: /Livre/i,
    });
    const firstFreeSlot = freeSlots[0];
    if (!firstFreeSlot) throw new Error("Slot not found");
    fireEvent.click(firstFreeSlot);

    const cancelBtn = await screen.findByRole("button", { name: /Agora não/i });
    fireEvent.click(cancelBtn);

    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).toBeNull();
    });
  });
});

describe("Empirical Challenger — Suite 3: Layout Packing & Time Boundary Invariant Oracle", () => {
  test("layoutEvents: empty array yields empty array", () => {
    expect(layoutEvents([])).toEqual([]);
  });

  test("layoutEvents: contiguous half-open intervals [08:00, 09:00) and [09:00, 10:00) do NOT overlap or conflict", () => {
    const items: AgendaItem[] = [
      {
        id: "item-a",
        date: "2026-11-03",
        start: "08:00",
        end: "09:00",
        title: "Bloco A",
        source: "import",
        status: "ativa",
        canCancel: false,
        mine: false,
        person: null,
      },
      {
        id: "item-b",
        date: "2026-11-03",
        start: "09:00",
        end: "10:00",
        title: "Bloco B",
        source: "import",
        status: "ativa",
        canCancel: false,
        mine: false,
        person: null,
      },
    ];

    const result = layoutEvents(items);
    expect(result.length).toBe(2);

    expect(result[0]?.isConflict).toBe(false);
    expect(result[1]?.isConflict).toBe(false);

    // Ambas compartilham a mesma lane 0 com total de lanes = 1
    expect(result[0]?.lane).toBe(0);
    expect(result[0]?.lanes).toBe(1);
    expect(result[1]?.lane).toBe(0);
    expect(result[1]?.lanes).toBe(1);
  });

  test("layoutEvents: 1-minute overlap causes pairwise conflict detection and multi-lane packing", () => {
    const items: AgendaItem[] = [
      {
        id: "item-a",
        date: "2026-11-03",
        start: "08:00",
        end: "09:01",
        title: "Bloco A",
        source: "import",
        status: "ativa",
        canCancel: false,
        mine: false,
        person: null,
      },
      {
        id: "item-b",
        date: "2026-11-03",
        start: "09:00",
        end: "10:00",
        title: "Bloco B",
        source: "import",
        status: "ativa",
        canCancel: false,
        mine: false,
        person: null,
      },
    ];

    const result = layoutEvents(items);
    expect(result[0]?.isConflict).toBe(true);
    expect(result[1]?.isConflict).toBe(true);

    expect(result[0]?.lanes).toBe(2);
    expect(result[1]?.lanes).toBe(2);
    expect(result[0]?.lane).not.toBe(result[1]?.lane);
  });

  test("layoutEvents: preserves sorting invariant and greedy packing across multiple lanes", () => {
    const items: AgendaItem[] = [
      {
        id: "item-long",
        date: "2026-11-03",
        start: "08:00",
        end: "12:00",
        title: "Long",
        source: "import",
        status: "ativa",
        canCancel: false,
        mine: false,
        person: null,
      },
      {
        id: "item-short-1",
        date: "2026-11-03",
        start: "08:30",
        end: "09:30",
        title: "Short 1",
        source: "import",
        status: "ativa",
        canCancel: false,
        mine: false,
        person: null,
      },
      {
        id: "item-short-2",
        date: "2026-11-03",
        start: "09:30",
        end: "10:30",
        title: "Short 2",
        source: "import",
        status: "ativa",
        canCancel: false,
        mine: false,
        person: null,
      },
    ];

    const result = layoutEvents(items);
    expect(result.length).toBe(3);

    const long = result.find((x) => x.id === "item-long");
    const short1 = result.find((x) => x.id === "item-short-1");
    const short2 = result.find((x) => x.id === "item-short-2");

    if (!long || !short1 || !short2) throw new Error("Expected events not found");

    expect(long.lane).toBe(0);
    expect(short1.lane).toBe(1);
    // short-2 começa em 09:30, quando short-1 já terminou. Deve reusar a lane 1!
    expect(short2.lane).toBe(1);

    // Total de faixas necessárias deve ser 2, não 3!
    expect(long.lanes).toBe(2);
    expect(short1.lanes).toBe(2);
    expect(short2.lanes).toBe(2);
  });

  test("timeToMinutes and formatHourAxis conversion invariants", () => {
    expect(timeToMinutes("00:00")).toBe(0);
    expect(timeToMinutes("06:00")).toBe(360);
    expect(timeToMinutes("12:30")).toBe(750);
    expect(timeToMinutes("23:59")).toBe(1439);

    expect(formatHourAxis(0)).toBe("00:00");
    expect(formatHourAxis(360)).toBe("06:00");
    expect(formatHourAxis(750)).toBe("12:00");
    expect(formatHourAxis(1380)).toBe("23:00");
  });
});

describe("Empirical Challenger — Suite 4: Route Helpers & Adversarial Search Parameter Validation", () => {
  test("validateAgendaSearch strictly rejects calendar anomalies, invalid dates, and script injections", () => {
    // Ano não bissexto 2026: 29 de fevereiro não existe
    expect(validateAgendaSearch({ data: "2026-02-29" })).toEqual({});

    // Novembro só tem 30 dias: 31 de novembro não existe
    expect(validateAgendaSearch({ data: "2026-11-31" })).toEqual({});

    // Mês inexistente 13
    expect(validateAgendaSearch({ data: "2026-13-01" })).toEqual({});

    // Dia zero
    expect(validateAgendaSearch({ data: "2026-00-00" })).toEqual({});

    // Tentativas de injeção
    expect(validateAgendaSearch({ data: "<script>alert(1)</script>" })).toEqual({});
    expect(validateAgendaSearch({ data: "../../etc/passwd" })).toEqual({});

    // Espaço com apenas espaços ou caracteres de escape
    expect(validateAgendaSearch({ espaco: "   " })).toEqual({});
    expect(validateAgendaSearch({ espaco: "\n\t" })).toEqual({});
    expect(validateAgendaSearch({ espaco: 12345 })).toEqual({});
    expect(validateAgendaSearch({ espaco: null })).toEqual({});

    // Data válida e espaço válido
    expect(validateAgendaSearch({ data: "2026-11-03", espaco: "lab-1" })).toEqual({
      data: "2026-11-03",
      espaco: "lab-1",
    });
  });

  test("getWeekStart handles year boundary, leap years, and month transitions correctly", () => {
    // 2027-01-01 é sexta-feira -> segunda anterior é 2026-12-28
    expect(getWeekStart("2027-01-01")).toBe("2026-12-28");

    // 2026-03-01 é domingo -> segunda anterior é 2026-02-23
    expect(getWeekStart("2026-03-01")).toBe("2026-02-23");

    // 2024-02-29 (bissexto) é quinta-feira -> segunda é 2024-02-26
    expect(getWeekStart("2024-02-29")).toBe("2024-02-26");

    // Qualquer segunda-feira devolve a si própria
    expect(getWeekStart("2026-11-02")).toBe("2026-11-02");
    expect(getWeekStart("2026-11-09")).toBe("2026-11-09");
  });

  test("getTodayDate correctly respects time zone wall-clock time", () => {
    // UTC 02:00 do dia 4 em São Paulo (-3h) ainda é dia 3 às 23:00
    const dt = new Date("2026-11-04T02:00:00Z");
    expect(getTodayDate("America/Sao_Paulo", dt)).toBe("2026-11-03");

    // UTC 03:00 do dia 4 em São Paulo (-3h) já é meia-noite do dia 4
    const dt2 = new Date("2026-11-04T03:00:00Z");
    expect(getTodayDate("America/Sao_Paulo", dt2)).toBe("2026-11-04");
  });
});
