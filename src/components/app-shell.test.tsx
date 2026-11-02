import { beforeEach, describe, expect, test } from "bun:test";
import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import type { User } from "#/domain/user";
import type { SessionInfo } from "#/server/session";
import { AppShell } from "./app-shell";

const ana: User = {
  id: "u1",
  email: "ana@ifsc.edu.br",
  name: "Ana Souza",
  code: null,
  roles: ["horarios"],
  active: true,
};
const anonymous: SessionInfo = { user: null, publicRead: true, timeZone: "America/Sao_Paulo" };

beforeEach(() => {
  delete document.documentElement.dataset.theme;
  localStorage.clear();
});

/** Renderiza o AppShell dentro de um roteador em memória (os links precisam do contexto). */
async function renderShell(children: ReactNode, session: SessionInfo = anonymous) {
  const root = createRootRouteWithContext<{ session: SessionInfo }>()({
    component: () => <AppShell>{children}</AppShell>,
  });
  const routes = ["/", "/importar", "/entrar", "/semestres"].map((path) =>
    createRoute({ getParentRoute: () => root, path }),
  );
  const router = createRouter({
    routeTree: root.addChildren(routes),
    history: createMemoryHistory({ initialEntries: ["/"] }),
    context: { session },
  });
  render(<RouterProvider router={router} />);
  await screen.findByRole("banner");
}

describe("AppShell", () => {
  test("mostra o nome do sistema e o conteúdo", async () => {
    await renderShell(<p>conteúdo</p>);
    expect(screen.getByRole("banner").textContent).toContain("Reserva de Espaços");
    expect(screen.getByRole("main").textContent).toBe("conteúdo");
  });

  test("navegação leva a início e à importação da grade", async () => {
    await renderShell("x", { user: ana, publicRead: true, timeZone: "America/Sao_Paulo" });
    const nav = screen.getByRole("navigation", { name: "Principal" });
    expect(screen.getByRole("link", { name: "Início" }).getAttribute("href")).toBe("/");
    expect(screen.getByRole("link", { name: "Importar grade" }).getAttribute("href")).toBe(
      "/importar",
    );
    expect(screen.getByRole("link", { name: "Semestres" }).getAttribute("href")).toBe("/semestres");
    expect(nav.querySelectorAll("a")).toHaveLength(3);
  });

  test("visitante vê Entrar e não vê Importar grade nem Sair", async () => {
    await renderShell("x");
    expect(screen.getByRole("link", { name: "Entrar" }).getAttribute("href")).toBe("/entrar");
    expect(screen.queryByRole("link", { name: "Importar grade" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Sair" })).toBeNull();
  });

  test("usuário logado vê o nome e Sair (POST em /api/sair), sem Entrar", async () => {
    await renderShell("x", { user: ana, publicRead: true, timeZone: "America/Sao_Paulo" });
    expect(screen.getByText("Ana Souza")).toBeDefined();
    const button = screen.getByRole("button", { name: "Sair" });
    const form = button.closest("form");
    expect(form?.getAttribute("method")?.toLowerCase()).toBe("post");
    expect(form?.getAttribute("action")).toBe("/api/sair");
    expect(screen.queryByRole("link", { name: "Entrar" })).toBeNull();
  });

  test("docente não vê Importar grade", async () => {
    await renderShell("x", {
      user: { ...ana, roles: ["docente"] },
      publicRead: true,
      timeZone: "America/Sao_Paulo",
    });
    expect(screen.queryByRole("link", { name: "Importar grade" })).toBeNull();
    expect(screen.getByRole("link", { name: "Início" })).toBeDefined();
  });

  test("admin vê Importar grade", async () => {
    await renderShell("x", {
      user: { ...ana, roles: ["admin"] },
      publicRead: true,
      timeZone: "America/Sao_Paulo",
    });
    expect(screen.getByRole("link", { name: "Importar grade" })).toBeDefined();
  });

  test("só admin vê Administração", async () => {
    await renderShell("x", {
      user: { ...ana, roles: ["admin"] },
      publicRead: true,
      timeZone: "America/Sao_Paulo",
    });
    expect(screen.getByRole("link", { name: "Administração" }).getAttribute("href")).toBe(
      "/admin/contas",
    );
    cleanup();
    await renderShell("x", {
      user: { ...ana, roles: ["horarios"] },
      publicRead: true,
      timeZone: "America/Sao_Paulo",
    });
    expect(screen.queryByRole("link", { name: "Administração" })).toBeNull();
    cleanup();
    await renderShell("x", anonymous);
    expect(screen.queryByRole("link", { name: "Administração" })).toBeNull();
  });

  test("Semestres para admin e horários, não para docente nem visitante", async () => {
    for (const role of ["admin", "horarios"] as const) {
      await renderShell("x", {
        user: { ...ana, roles: [role] },
        publicRead: true,
        timeZone: "America/Sao_Paulo",
      });
      expect(screen.getByRole("link", { name: "Semestres" })).toBeDefined();
      cleanup();
    }
    await renderShell("x", {
      user: { ...ana, roles: ["docente"] },
      publicRead: true,
      timeZone: "America/Sao_Paulo",
    });
    expect(screen.queryByRole("link", { name: "Semestres" })).toBeNull();
    cleanup();
    await renderShell("x", anonymous);
    expect(screen.queryByRole("link", { name: "Semestres" })).toBeNull();
  });
  test("alternar o tema muda data-theme e persiste a escolha", async () => {
    document.documentElement.dataset.theme = "light";
    await renderShell("x");
    const toggle = screen.getByRole("button", { name: "Alternar tema" });

    expect(toggle.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(toggle);
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("theme")).toBe("dark");
    expect(toggle.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(toggle);
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(localStorage.getItem("theme")).toBe("light");
  });

  test("alterna mesmo quando localStorage falha", async () => {
    document.documentElement.dataset.theme = "light";
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error("bloqueado");
    };
    try {
      await renderShell("x");
      fireEvent.click(screen.getByRole("button", { name: "Alternar tema" }));
      expect(document.documentElement.dataset.theme).toBe("dark");
    } finally {
      Storage.prototype.setItem = original;
    }
  });
});
