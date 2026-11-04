import { describe, expect, mock, test } from "bun:test";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { fireEvent, render, screen } from "@testing-library/react";
import type { MyBooking } from "#/application/bookings";
import { navItems } from "#/components/app-shell";
import type { User } from "#/domain/user";
import { MinhasReservasList, Route, validateMinhasReservasSearch } from "#/routes/minhas-reservas";
import type { SessionInfo } from "#/server/session";

const MOCK_USER: User = {
  id: "u-1",
  name: "Prof. Carlos Silva",
  email: "carlos@ifsc.edu.br",
  code: "CSILVA",
  roles: ["docente"],
  active: true,
};

const MOCK_BOOKING_MANUAL: MyBooking = {
  id: "b-man-1",
  spaceId: "space-adm",
  spaceName: "ADM 2",
  date: "2026-11-10",
  start: "10:10",
  end: "12:00",
  title: "Reunião de Colegiado",
  source: "manual",
  status: "ativa",
  canCancel: true,
  mine: true,
};

const MOCK_BOOKING_IMPORTED: MyBooking = {
  id: "b-imp-2",
  spaceId: "space-lab",
  spaceName: "LAB 1",
  date: "2026-11-17",
  start: "08:00",
  end: "09:40",
  title: "Cálculo I",
  source: "import",
  status: "ativa",
  canCancel: true,
  mine: true,
};

const MOCK_BOOKING_UNCANCELLABLE: MyBooking = {
  id: "b-past-3",
  spaceId: "space-aud",
  spaceName: "Auditório",
  date: "2026-11-02",
  start: "08:00",
  end: "10:00",
  title: "Palestra Magna",
  source: "manual",
  status: "ativa",
  canCancel: false,
  mine: true,
};

async function renderWithRouter(ui: React.ReactElement) {
  const root = createRootRoute({ component: () => ui });
  const home = createRoute({
    getParentRoute: () => root,
    path: "/",
    component: () => <div>Agenda Home</div>,
  });
  const router = createRouter({
    routeTree: root.addChildren([home]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  return render(<RouterProvider router={router} />);
}

describe("Minhas Reservas — Suíte de Testes (Milestone 2 Task 4)", () => {
  describe("1. Funções de Busca e Guard de Rota", () => {
    test("validateMinhasReservasSearch: extrai e apara newId", () => {
      expect(validateMinhasReservasSearch({ newId: "  booking-123  " })).toEqual({
        newId: "booking-123",
      });
      expect(validateMinhasReservasSearch({ newId: "" })).toEqual({});
      expect(validateMinhasReservasSearch({ newId: 12345 })).toEqual({});
      expect(validateMinhasReservasSearch({})).toEqual({});
    });

    test("Route.beforeLoad: redireciona usuário deslogado para /entrar?voltar=/minhas-reservas", () => {
      const mockContext = {
        session: {
          user: null,
          publicRead: true,
          timeZone: "America/Sao_Paulo",
        } as SessionInfo,
      };

      expect(() => {
        // @ts-expect-error accessing route beforeLoad directly in test
        Route.options.beforeLoad({
          context: mockContext,
        });
      }).toThrow();
    });

    test("Route.beforeLoad: permite acesso quando usuário está autenticado", () => {
      const mockContext = {
        session: {
          user: MOCK_USER,
          publicRead: true,
          timeZone: "America/Sao_Paulo",
        } as SessionInfo,
      };

      expect(() => {
        // @ts-expect-error accessing route beforeLoad directly in test
        Route.options.beforeLoad({
          context: mockContext,
        });
      }).not.toThrow();
    });
  });

  describe("2. Integração no AppShell (navItems)", () => {
    test("usuário não autenticado: não vê link 'Minhas reservas'", () => {
      const items = navItems(null);
      expect(items.find((i) => i.to === "/minhas-reservas")).toBeUndefined();
      expect(items).toEqual([{ to: "/", label: "Agenda", exact: true }]);
    });

    test("usuário autenticado: vê link 'Minhas reservas' no menu", () => {
      const items = navItems(MOCK_USER);
      const bookingLink = items.find((i) => i.to === "/minhas-reservas");
      expect(bookingLink).toBeDefined();
      expect(bookingLink?.label).toBe("Minhas reservas");
    });
  });

  describe("3. Renderização da Lista e Estados Visuais", () => {
    test("renderiza estado vazio quando não há reservas futuras", async () => {
      await renderWithRouter(<MinhasReservasList items={[]} />);

      expect(screen.getByText("Nenhuma reserva futura.")).toBeDefined();
      expect(
        screen.getByText("Você não possui reservas ou aulas agendadas para os próximos dias."),
      ).toBeDefined();

      const link = screen.getByRole("link", { name: "Ver agenda" });
      expect(link.getAttribute("href")).toBe("/");
    });

    test("renderiza lista cronológica com crachá de data e informações da sala", async () => {
      await renderWithRouter(
        <MinhasReservasList items={[MOCK_BOOKING_MANUAL, MOCK_BOOKING_IMPORTED]} />,
      );

      // Card 1
      expect(screen.getByText("Reunião de Colegiado")).toBeDefined();
      expect(screen.getByText(/ADM 2 · 10:10–12:00/)).toBeDefined();
      expect(screen.getByText("Reserva manual")).toBeDefined();

      // Card 2
      expect(screen.getByText("Cálculo I")).toBeDefined();
      expect(screen.getByText(/LAB 1 · 08:00–09:40/)).toBeDefined();
      expect(screen.getByText("Aula importada · você é responsável")).toBeDefined();

      // Datas: 10 de Novembro e 17 de Novembro
      expect(screen.getByText("10")).toBeDefined();
      expect(screen.getByText("17")).toBeDefined();
      expect(screen.getAllByText("Nov").length).toBe(2);
    });

    test("destaca visualmente reserva recém-criada quando coincide com newId", async () => {
      await renderWithRouter(
        <MinhasReservasList items={[MOCK_BOOKING_MANUAL, MOCK_BOOKING_IMPORTED]} newId="b-man-1" />,
      );

      const targetCard = screen.getByTestId("booking-card-b-man-1");
      expect(targetCard.className).toContain("item-new");
      expect(targetCard.className).toContain("border-primary");

      // Badge 'Nova'
      expect(screen.getByText("Nova")).toBeDefined();

      // Outro card não deve ter destaque nem badge 'Nova'
      const otherCard = screen.getByTestId("booking-card-b-imp-2");
      expect(otherCard.className).not.toContain("item-new");
    });

    test("botão 'Cancelar…' aciona callback onSelectCancel com a ocupação correspondente", async () => {
      const mockCancelSelect = mock((_item: MyBooking) => {});
      await renderWithRouter(
        <MinhasReservasList items={[MOCK_BOOKING_MANUAL]} onSelectCancel={mockCancelSelect} />,
      );

      const cancelBtn = screen.getByRole("button", { name: "Cancelar…" });
      fireEvent.click(cancelBtn);

      expect(mockCancelSelect).toHaveBeenCalledTimes(1);
      expect(mockCancelSelect).toHaveBeenCalledWith(MOCK_BOOKING_MANUAL);
    });

    test("omite botão 'Cancelar…' quando canCancel === false", async () => {
      await renderWithRouter(<MinhasReservasList items={[MOCK_BOOKING_UNCANCELLABLE]} />);

      expect(screen.queryByRole("button", { name: "Cancelar…" })).toBeNull();
    });

    test("teclado e acessibilidade: botões e links são navegáveis", async () => {
      await renderWithRouter(<MinhasReservasList items={[MOCK_BOOKING_MANUAL]} />);

      const cancelBtn = screen.getByRole("button", { name: "Cancelar…" });
      expect(cancelBtn.tabIndex).toBe(0);
    });
  });
});
