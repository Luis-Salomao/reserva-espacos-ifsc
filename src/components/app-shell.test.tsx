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

  test("alternar o tema muda data-theme e persiste a escolha", () => {
    document.documentElement.dataset.theme = "light";
    render(<AppShell>x</AppShell>);
    const toggle = screen.getByRole("button", { name: "Alternar tema" });

    fireEvent.click(toggle);
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("theme")).toBe("dark");

    fireEvent.click(toggle);
    expect(document.documentElement.dataset.theme).toBe("light");
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
