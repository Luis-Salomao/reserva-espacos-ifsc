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
import { AppShell, SCREEN_HINTS } from "./app-shell";

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
async function renderShell(children: ReactNode, session: SessionInfo = anonymous, initial = "/") {
  const root = createRootRouteWithContext<{ session: SessionInfo }>()({
    component: () => <AppShell>{children}</AppShell>,
  });
  const routes = [
    "/",
    "/minhas-reservas",
    "/importar",
    "/entrar",
    "/semestres",
    "/manutencao/espacos",
  ].map((path) => createRoute({ getParentRoute: () => root, path }));
  const router = createRouter({
    routeTree: root.addChildren(routes),
    history: createMemoryHistory({ initialEntries: [initial] }),
    context: { session },
  });
  render(<RouterProvider router={router} />);
  await screen.findByRole("banner");
}

function expectAlignedNavigationIcons(links: Iterable<Element>) {
  for (const link of links) {
    const slot = link.querySelector(":scope > span[aria-hidden='true']");
    const icon = slot?.querySelector("svg");
    expect(slot?.classList.contains("size-5")).toBe(true);
    expect(slot?.classList.contains("place-items-center")).toBe(true);
    expect(slot?.classList.contains("shrink-0")).toBe(true);
    expect(icon?.classList.contains("size-4")).toBe(true);
    expect(icon?.classList.contains("shrink-0")).toBe(true);
  }
}

describe("AppShell", () => {
  test("cabeçalho do visitante mostra o nome do sistema e a explicação", async () => {
    await renderShell(<p>x</p>);
    const banner = screen.getByRole("banner");
    expect(banner.textContent).toContain("Sistema de Reserva de Espaços");
    expect(banner.textContent).toContain("Consulte a ocupação das salas e reserve espaços");
    expect(banner.textContent).not.toContain("…");
  });
  test("a barra superior do logado é verde do IFSC; o cabeçalho do visitante (com logo) é neutro", async () => {
    await renderShell(<p>x</p>);
    expect(screen.getByRole("banner").className).not.toContain("primary");
    cleanup();
    await renderShell("x", { user: ana, publicRead: true, timeZone: "America/Sao_Paulo" });
    const lateral = screen.getByRole("banner").className.split(" ");
    expect(lateral).toContain("menu-forte");
    // Lateral com token próprio: #32A041 no claro, verde profundo no escuro.
    expect(lateral).toContain("md:bg-sidebar");
    expect(lateral).not.toContain("md:bg-primary");
    const barra = screen.getByRole("navigation", { name: "Localização" }).className.split(" ");
    expect(barra).toContain("bg-menu-soft");
    expect(barra).toContain("text-foreground");
    expect(barra).toContain("border-divider");
    expect(barra).not.toContain("bg-primary");
    expect(barra).not.toContain("border-primary");
  });
  test("não há faixa vermelha no topo em nenhum layout", async () => {
    await renderShell(<p>x</p>);
    expect(document.querySelectorAll("[data-faixa-ifsc]").length).toBe(0);
    cleanup();
    await renderShell("x", { user: ana, publicRead: true, timeZone: "America/Sao_Paulo" });
    expect(document.querySelectorAll("[data-faixa-ifsc]").length).toBe(0);
  });
  test("o topo não sai do lugar ao rolar: cabeçalho do visitante e barra superior do logado são sticky", async () => {
    await renderShell(<p>x</p>);
    expect(screen.getByRole("banner").className.split(" ")).toEqual(
      expect.arrayContaining(["sticky", "top-0"]),
    );
    cleanup();
    await renderShell("x", { user: ana, publicRead: true, timeZone: "America/Sao_Paulo" });
    expect(screen.getByRole("navigation", { name: "Localização" }).className.split(" ")).toEqual(
      expect.arrayContaining(["sticky", "top-0"]),
    );
  });
  test("cabeçalho do usuário logado também mostra o nome do sistema", async () => {
    await renderShell("x", { user: ana, publicRead: true, timeZone: "America/Sao_Paulo" });
    const banner = screen.getByRole("banner");
    expect(banner.textContent).toContain("Sistema de Reserva de Espaços");
    expect(banner.querySelectorAll("h1").length).toBe(0);
  });
  test("lateral do computador não repete o texto do sistema; a barra superior mostra sistema e tela", async () => {
    await renderShell("x", { user: ana, publicRead: true, timeZone: "America/Sao_Paulo" });
    const sidebar = screen.getByRole("banner");
    // O texto do sistema fica na lateral só no celular (md:hidden).
    const text = [...sidebar.querySelectorAll("p")].find((p) =>
      p.textContent?.includes("Sistema de Reserva de Espaços"),
    );
    expect(text?.parentElement?.className).toContain("md:hidden");
    const bar = screen.getByRole("navigation", { name: "Localização" });
    expect(bar.textContent).toContain("Sistema de Reserva de Espaços");
    expect(bar.textContent).toContain(SCREEN_HINTS["/"]);
    expect(bar.querySelectorAll("h1").length).toBe(0);
    expect(bar.textContent).not.toContain("…");
    expect(bar.className).toContain("bg-menu-soft");
  });
  test("toda frase de tela é curta (até 60 caracteres) e sem reticências", () => {
    for (const hint of Object.values(SCREEN_HINTS)) {
      expect(hint.length).toBeLessThanOrEqual(60);
      expect(hint).not.toContain("…");
    }
  });
  test("barra superior mostra a frase da tela atual (Minhas reservas)", async () => {
    await renderShell(
      "x",
      { user: { ...ana, roles: ["admin"] }, publicRead: true, timeZone: "America/Sao_Paulo" },
      "/minhas-reservas",
    );
    const bar = screen.getByRole("navigation", { name: "Localização" });
    expect(bar.textContent).toContain("Veja e gerencie as suas reservas");
    expect(bar.textContent).not.toContain(SCREEN_HINTS["/"]);
  });
  test("visitante não tem a barra de localização", async () => {
    await renderShell("x");
    expect(screen.queryByRole("navigation", { name: "Localização" })).toBeNull();
  });
  test("recolhe e expande a lateral, preservando links e a preferência", async () => {
    await renderShell("x", { user: ana, publicRead: true, timeZone: "America/Sao_Paulo" });
    const nav = screen.getByRole("navigation", { name: "Principal" });
    expectAlignedNavigationIcons(nav.querySelectorAll("a"));
    fireEvent.click(screen.getByRole("button", { name: "Recolher menu lateral" }));
    expect(
      screen.getByRole("button", { name: "Expandir menu lateral" }).getAttribute("aria-expanded"),
    ).toBe("false");
    expect(localStorage.getItem("sidebar-collapsed")).toBe("true");
    expect(screen.getByRole("link", { name: "Importar" }).getAttribute("href")).toBe("/importar");
    expectAlignedNavigationIcons(nav.querySelectorAll("a"));
    fireEvent.click(screen.getByRole("button", { name: "Expandir menu lateral" }));
    expect(localStorage.getItem("sidebar-collapsed")).toBe("false");
  });
  test("mostra o nome do sistema e o conteúdo", async () => {
    await renderShell(<p>conteúdo</p>);
    expect(
      screen.getByRole("link", { name: "IFSC Câmpus Garopaba — Reserva de espaços" }),
    ).toBeDefined();
    // O texto "Reserva de espaços" não aparece visível no cabeçalho; só o nome acessível do link.
    expect(screen.getByRole("banner").textContent).not.toContain("Reserva de espaços");
    const logos = screen.getByRole("banner").querySelectorAll("img[aria-hidden='true']");
    expect(logos.length).toBe(2);
    const clara = logos[0];
    const escura = logos[1];
    expect(clara?.getAttribute("src")).toContain("ifsc-garopaba-horizontal.png");
    expect(escura?.getAttribute("src")).toContain("ifsc-garopaba-horizontal-escuro.png");
    expect(clara?.className).toContain("dark:hidden");
    expect(escura?.className).toContain("hidden");
    expect(escura?.className).toContain("dark:block");
    expect(clara?.className).not.toContain("bg-");
    expect(escura?.className).not.toContain("bg-");
    expect(screen.getByRole("main").textContent).toBe("conteúdo");
  });

  test("na lateral o logo é a versão negativa direto no verde, sem placa; o celular troca por tema", async () => {
    await renderShell("x", { user: ana, publicRead: true, timeZone: "America/Sao_Paulo" });
    const link = screen.getByRole("link", { name: "IFSC Câmpus Garopaba — Reserva de espaços" });
    expect(link.className).not.toContain("bg-white");
    const [clara, escura, negativa] = [...link.querySelectorAll("img")];
    expect(clara?.className).toContain("md:hidden");
    expect(escura?.className).toContain("md:dark:hidden");
    expect(negativa?.dataset.logo).toBe("negativo");
    expect(negativa?.className.split(" ")).toContain("md:block");
  });

  test("o visitante não recebe o logo negativo (o cabeçalho dele é neutro)", async () => {
    await renderShell(<p>x</p>);
    const link = screen.getByRole("link", { name: "IFSC Câmpus Garopaba — Reserva de espaços" });
    expect(link.querySelector("[data-logo='negativo']")).toBeNull();
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
    fireEvent.click(screen.getByRole("button", { name: "Conta de Ana Souza" }));
    const button = await screen.findByRole("button", { name: "Sair" });
    expect(screen.queryByText("Configurações")).toBeNull();
    const form = button.closest("form");
    expect(form?.getAttribute("method")?.toLowerCase()).toBe("post");
    expect(form?.getAttribute("action")).toBe("/api/sair");
    expect(screen.queryByRole("link", { name: "Entrar" })).toBeNull();
    expect(screen.getByRole("button", { name: "Tema escuro" })).toBeDefined();
  });

  test("menu lateral recolhido mantém o botão de tema dentro do rodapé", async () => {
    await renderShell("x", { user: ana, publicRead: true, timeZone: "America/Sao_Paulo" });
    fireEvent.click(screen.getByRole("button", { name: "Recolher menu lateral" }));
    const theme = screen.getByRole("button", { name: "Tema escuro" });
    expect(theme.parentElement?.className).toContain("md:flex-col");
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
    const toggle = screen.getByRole("button", { name: "Tema escuro" });

    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(toggle.getAttribute("title")).toBe("Mudar para tema escuro");

    fireEvent.click(toggle);
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("theme")).toBe("dark");
    expect(screen.getByRole("button", { name: "Tema escuro" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(screen.getByRole("button", { name: "Tema escuro" }).getAttribute("title")).toBe(
      "Mudar para tema claro",
    );

    fireEvent.click(screen.getByRole("button", { name: "Tema escuro" }));
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
      fireEvent.click(screen.getByRole("button", { name: "Tema escuro" }));
      expect(document.documentElement.dataset.theme).toBe("dark");
    } finally {
      Storage.prototype.setItem = original;
    }
  });
});

describe("AppShell, estilo agenda", () => {
  test("marca só com o nome do sistema e link ativo com aria-current", async () => {
    await renderShell("x", { user: ana, publicRead: true, timeZone: "America/Sao_Paulo" });
    expect(
      screen
        .getByRole("link", { name: "IFSC Câmpus Garopaba — Reserva de espaços" })
        .getAttribute("href"),
    ).toBe("/");
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
    expectAlignedNavigationIcons(panel?.querySelectorAll("a") ?? []);
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
