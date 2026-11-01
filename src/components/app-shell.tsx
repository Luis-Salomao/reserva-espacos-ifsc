import type { ReactNode } from "react";
import { ThemeToggle } from "#/components/theme-toggle";
import { cn } from "#/lib/utils";

type Props = { children: ReactNode; wide?: boolean };

/** Estrutura base das páginas: cabeçalho com nome do sistema, navegação e área principal. */
export function AppShell({ children, wide = false }: Props) {
  const width = wide ? "max-w-6xl" : "max-w-3xl";
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="border-b bg-surface">
        <div
          className={cn(
            "mx-auto flex min-h-14 w-full flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2",
            width,
          )}
        >
          <span className="text-base font-semibold">Reserva de Espaços</span>
          <div className="flex items-center gap-1">
            <nav aria-label="Principal" className="flex items-center gap-1 text-sm">
              <a href="/" className="rounded-md px-2 py-2 hover:bg-surface-2">
                Início
              </a>
              <a href="/importar" className="rounded-md px-2 py-2 hover:bg-surface-2">
                Importar grade
              </a>
            </nav>
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className={cn("mx-auto w-full flex-1 px-4 py-6", width)}>{children}</main>
    </div>
  );
}
