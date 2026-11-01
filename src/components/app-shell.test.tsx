import { beforeEach, describe, expect, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { AppShell } from "./app-shell";

beforeEach(() => {
  delete document.documentElement.dataset.theme;
  localStorage.clear();
});

describe("AppShell", () => {
  test("mostra o nome do sistema e o conteúdo", () => {
    render(
      <AppShell>
        <p>conteúdo</p>
      </AppShell>,
    );
    expect(screen.getByRole("banner").textContent).toContain("Reserva de Espaços");
    expect(screen.getByRole("main").textContent).toBe("conteúdo");
  });

  test("navegação leva a início e à importação da grade", () => {
    render(<AppShell>x</AppShell>);
    const nav = screen.getByRole("navigation", { name: "Principal" });
    expect(screen.getByRole("link", { name: "Início" }).getAttribute("href")).toBe("/");
    expect(screen.getByRole("link", { name: "Importar grade" }).getAttribute("href")).toBe(
      "/importar",
    );
    expect(nav.querySelectorAll("a")).toHaveLength(2);
  });

  test("alternar o tema muda data-theme e persiste a escolha", () => {
    document.documentElement.dataset.theme = "light";
    render(<AppShell>x</AppShell>);
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

  test("alterna mesmo quando localStorage falha", () => {
    document.documentElement.dataset.theme = "light";
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error("bloqueado");
    };
    try {
      render(<AppShell>x</AppShell>);
      fireEvent.click(screen.getByRole("button", { name: "Alternar tema" }));
      expect(document.documentElement.dataset.theme).toBe("dark");
    } finally {
      Storage.prototype.setItem = original;
    }
  });
});
