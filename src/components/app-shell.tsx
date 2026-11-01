import type { ReactNode } from "react";
import { ThemeToggle } from "#/components/theme-toggle";

/** Estrutura base das páginas: cabeçalho com nome do sistema e área principal. */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="border-b bg-surface">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between px-4">
          <span className="text-base font-semibold">Reserva de Espaços</span>
          <ThemeToggle />
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
