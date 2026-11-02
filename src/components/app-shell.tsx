import { Link, useRouteContext } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ThemeToggle } from "#/components/theme-toggle";
import { Button } from "#/components/ui/button";
import { cn } from "#/lib/utils";
import { ADMIN_ROLES, IMPORT_ROLES, SEMESTER_ROLES, type SessionInfo } from "#/server/session";

type Props = { children: ReactNode; wide?: boolean };

/** Lê o usuário do contexto da raiz (ausente em roteadores de teste sem sessão). */
function useSessionUser(): SessionInfo["user"] {
  const context: { session?: SessionInfo } = useRouteContext({ strict: false });
  return context.session?.user ?? null;
}

/** Estrutura base das páginas: cabeçalho com nome do sistema, navegação e área principal. */
export function AppShell({ children, wide = false }: Props) {
  const width = wide ? "max-w-6xl" : "max-w-3xl";
  const user = useSessionUser();
  const canImport = user?.roles.some((role) => IMPORT_ROLES.includes(role)) ?? false;
  const canConfigureSemesters = user?.roles.some((role) => SEMESTER_ROLES.includes(role)) ?? false;
  const isAdmin = user?.roles.some((role) => ADMIN_ROLES.includes(role)) ?? false;
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
          <div className="flex flex-wrap items-center gap-1">
            <nav aria-label="Principal" className="flex items-center gap-1 text-sm">
              <Link to="/" className="rounded-md px-2 py-2 hover:bg-surface-2">
                Início
              </Link>
              {canImport && (
                <Link to="/importar" className="rounded-md px-2 py-2 hover:bg-surface-2">
                  Importar grade
                </Link>
              )}
              {canConfigureSemesters && (
                <Link to="/semestres" className="rounded-md px-2 py-2 hover:bg-surface-2">
                  Semestres
                </Link>
              )}
              {isAdmin && (
                <Link to="/admin/contas" className="rounded-md px-2 py-2 hover:bg-surface-2">
                  Administração
                </Link>
              )}
              {user === null && (
                <Link to="/entrar" className="rounded-md px-2 py-2 hover:bg-surface-2">
                  Entrar
                </Link>
              )}
            </nav>
            {user !== null && (
              <div className="flex items-center gap-2 text-sm">
                <span className="max-w-40 truncate px-1 text-muted-foreground">{user.name}</span>
                <form method="post" action="/api/sair">
                  <Button type="submit" variant="outline" size="sm">
                    Sair
                  </Button>
                </form>
              </div>
            )}
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className={cn("mx-auto w-full flex-1 px-4 py-6", width)}>{children}</main>
    </div>
  );
}
