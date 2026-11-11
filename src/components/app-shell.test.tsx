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
  placeholder: false,
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
  const routes = ["/", "/importar", "/entrar", "/semestres", "/manutencao/espacos"].map((path) =>
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
  test("recolhe e expande a lateral, preservando links e a preferência", async () => {
    await renderShell("x", { user: ana, publicRead: true, timeZone: "America/Sao_Paulo" });
    fireEvent.click(screen.getByRole("button", { name: "Recolher menu lateral" }));
    expect(
      screen.getByRole("button", { name: "Expandir menu lateral" }).getAttribute("aria-expanded"),
    ).toBe("false");
    expect(localStorage.getItem("sidebar-collapsed")).toBe("true");
    expect(screen.getByRole("link", { name: "Importar" }).getAttribute("href")).toBe("/importar");
    fireEvent.click(screen.getByRole("button", { name: "Expandir menu lateral" }));
    expect(localStorage.getItem("sidebar-collapsed")).toBe("false");
  });
  test("mostra o nome do sistema e o conteúdo", async () => {
    await renderShell(<p>conteúdo</p>);
    expect(screen.getByRole("banner").textContent).toContain("Reserva de Espaços");
    expect(screen.getByRole("main").textContent).toBe("conteúdo");
  });

  test("navegação leva à agenda, importação e semestres", async () => {
    await renderShell("x", { user: ana, publicRead: true, timeZone: "America/Sao_Paulo" });
    const nav = screen.getByRole("navigation", { name: "Principal" });
    expect(screen.getByRole("link", { name: "Agenda" }).getAttribute("href")).toBe("/");
    expect(screen.getByRole("link", { name: "Importar" }).getAttribute("href")).toBe("/importar");
    expect(screen.getByRole("link", { name: "Semestres" }).getAttribute("href")).toBe("/semestres");
    expect(nav.querySelectorAll("a")).toHaveLength(3);
  });

  test("nenhum papel tem o item 'Salas' no menu: as salas são visualizações da Agenda", async () => {
    for (const role of ["admin", "horarios", "docente"] as const) {
      await renderShell("x", {
        user: { ...ana, roles: [role] },
        publicRead: true,
        timeZone: "America/Sao_Paulo",
      });
      const nav = screen.getByRole("navigation", { name: "Principal" });
      const labels = [...nav.querySelectorAll("a")].map((link) => link.textContent);
      expect(labels[0]).toBe("Agenda");
      expect(labels.includes("Salas")).toBe(false);
      expect(document.querySelector("a[href='/salas']") === null).toBe(true);
      fireEvent.click(screen.getByRole("button", { name: "Menu" }));
      expect(screen.queryByRole("link", { name: "Salas" }) === null).toBe(true);
      cleanup();
    }
    await renderShell("x", anonymous);
    expect(document.querySelector("a[href='/salas']") === null).toBe(true);
  });

  test("visitante vê Entrar e não vê Importar nem Sair", async () => {
    await renderShell("x");
    // Visitante usa cabeçalho simples, com uma única entrada para a conta.
    const entrar = screen.getAllByRole("link", { name: "Entrar" });
    expect(entrar).toHaveLength(1);
    for (const link of entrar) expect(link.getAttribute("href")).toBe("/entrar");
    expect(screen.queryByRole("link", { name: "Importar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Sair" })).toBeNull();
  });

  test("usuário logado vê o nome e Sair (POST em /api/sair), sem Entrar", async () => {
    await renderShell("x", { user: ana, publicRead: true, timeZone: "America/Sao_Paulo" });
    expect(screen.getByText("Ana Souza")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Sair" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Configurações de Ana Souza" }));
    const button = await screen.findByRole("button", { name: "Sair" });
    const form = button.closest("form");
    expect(form?.getAttribute("method")?.toLowerCase()).toBe("post");
    expect(form?.getAttribute("action")).toBe("/api/sair");
    expect(screen.queryByRole("link", { name: "Entrar" })).toBeNull();
  });

  test("docente não vê Importar", async () => {
    await renderShell("x", {
      user: { ...ana, roles: ["docente"] },
      publicRead: true,
      timeZone: "America/Sao_Paulo",
    });
    expect(screen.queryByRole("link", { name: "Importar" })).toBeNull();
    expect(screen.getByRole("link", { name: "Agenda" })).toBeDefined();
  });

  test("admin vê Importar", async () => {
    await renderShell("x", {
      user: { ...ana, roles: ["admin"] },
      publicRead: true,
      timeZone: "America/Sao_Paulo",
    });
    expect(screen.getByRole("link", { name: "Importar" })).toBeDefined();
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
  test("Manutenção aparece para manutencao e admin, não para docente nem visitante", async () => {
    for (const role of ["manutencao", "admin"] as const) {
      await renderShell("x", {
        user: { ...ana, roles: [role] },
        publicRead: true,
        timeZone: "America/Sao_Paulo",
      });
      expect(screen.getByRole("link", { name: "Manutenção" }).getAttribute("href")).toBe(
        "/manutencao/espacos",
      );
      cleanup();
    }
    await renderShell("x", {
      user: { ...ana, roles: ["docente"] },
      publicRead: true,
      timeZone: "America/Sao_Paulo",
    });
    expect(screen.queryByRole("link", { name: "Manutenção" })).toBeNull();
    cleanup();
    await renderShell("x", anonymous);
    expect(screen.queryByRole("link", { name: "Manutenção" })).toBeNull();
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

describe("AppShell, estilo agenda", () => {
  test("marca só com o nome do sistema e link ativo com aria-current", async () => {
    await renderShell("x", { user: ana, publicRead: true, timeZone: "America/Sao_Paulo" });
    expect(screen.getByRole("link", { name: "Reserva de Espaços" }).getAttribute("href")).toBe("/");
    expect(screen.getByRole("link", { name: "Agenda" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Importar" }).getAttribute("aria-current")).toBeNull();
  });

  const logged: SessionInfo = { user: ana, publicRead: true, timeZone: "America/Sao_Paulo" };

  test("menu do celular: aria-controls aponta para o painel com os links", async () => {
    await renderShell("x", logged);
    const trigger = screen.getByRole("button", { name: "Menu" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.getElementById(trigger.getAttribute("aria-controls") ?? "")).toBeNull();
    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    const panel = document.getElementById(trigger.getAttribute("aria-controls") ?? "");
    expect(panel).not.toBeNull();
    expect(panel?.querySelectorAll("a")).toHaveLength(3);
    expect(panel?.querySelector("a[href='/salas']") === null).toBe(true);
    expect(panel?.querySelector("form[action='/api/sair']")).toBeNull();
  });

  test("menu do celular fecha ao tocar fora", async () => {
    await renderShell("x", logged);
    const trigger = screen.getByRole("button", { name: "Menu" });
    fireEvent.click(trigger);
    fireEvent.pointerDown(screen.getByRole("main"));
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  test("menu do celular fecha ao escolher um link", async () => {
    await renderShell("x", logged);
    const trigger = screen.getByRole("button", { name: "Menu" });
    fireEvent.click(trigger);
    const panel = document.getElementById(trigger.getAttribute("aria-controls") ?? "");
    const link = panel?.querySelector("a[href='/semestres']");
    expect(link).not.toBeNull();
    fireEvent.click(link as Element);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  test("Esc fecha o menu e devolve o foco ao botão só se o foco estava dentro", async () => {
    await renderShell("x", logged);
    const trigger = screen.getByRole("button", { name: "Menu" });
    fireEvent.click(trigger);
    const panel = document.getElementById(trigger.getAttribute("aria-controls") ?? "");
    const first = panel?.querySelector("a");
    expect(first).not.toBeNull();
    (first as HTMLElement).focus();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);

    // Foco fora do menu: Esc fecha, mas não rouba o foco.
    fireEvent.click(trigger);
    const outside = screen.getByRole("main");
    outside.focus();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(outside);
  });

  test("o menu fecha quando o foco sai dele", async () => {
    await renderShell("x", logged);
    const trigger = screen.getByRole("button", { name: "Menu" });
    fireEvent.click(trigger);
    fireEvent.focusOut(trigger, { relatedTarget: screen.getByRole("main") });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  test("link para pular ao conteúdo aponta para o main", async () => {
    await renderShell("x", logged);
    const skip = screen.getByRole("link", { name: "Pular para o conteúdo" });
    expect(skip.getAttribute("href")).toBe("#conteudo");
    expect(screen.getByRole("main").id).toBe("conteudo");
  });
});
