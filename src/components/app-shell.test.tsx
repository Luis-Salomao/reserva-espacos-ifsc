import { beforeEach, describe, expect, test } from "bun:test";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { AppShell } from "./app-shell";

beforeEach(() => {
  delete document.documentElement.dataset.theme;
  localStorage.clear();
});

/** Renderiza o AppShell dentro de um roteador em memória (os links precisam do contexto). */
async function renderShell(children: ReactNode) {
  const root = createRootRoute({ component: () => <AppShell>{children}</AppShell> });
  const routes = ["/", "/importar"].map((path) =>
    createRoute({ getParentRoute: () => root, path }),
  );
  const router = createRouter({
    routeTree: root.addChildren(routes),
    history: createMemoryHistory({ initialEntries: ["/"] }),
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
    await renderShell("x");
    const nav = screen.getByRole("navigation", { name: "Principal" });
    expect(screen.getByRole("link", { name: "Início" }).getAttribute("href")).toBe("/");
    expect(screen.getByRole("link", { name: "Importar grade" }).getAttribute("href")).toBe(
      "/importar",
    );
    expect(nav.querySelectorAll("a")).toHaveLength(2);
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
