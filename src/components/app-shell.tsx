import { Link, useRouteContext } from "@tanstack/react-router";
import { CalendarDays, Menu, X } from "lucide-react";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { ThemeToggle } from "#/components/theme-toggle";
import { Button } from "#/components/ui/button";
import { cn } from "#/lib/utils";
import { ADMIN_ROLES, IMPORT_ROLES, SEMESTER_ROLES, type SessionInfo } from "#/server/session";

type Props = { children: ReactNode; wide?: boolean };

type NavItem = {
  to: "/" | "/importar" | "/semestres" | "/admin/contas";
  label: string;
  exact?: true;
};

/** Lê o usuário do contexto da raiz (ausente em roteadores de teste sem sessão). */
function useSessionUser(): SessionInfo["user"] {
  const context: { session?: SessionInfo } = useRouteContext({ strict: false });
  return context.session?.user ?? null;
}

/** Itens de navegação visíveis conforme os papéis. "Minhas reservas" entra na Tarefa 4, com a rota. */
function navItems(user: SessionInfo["user"]): NavItem[] {
  const has = (roles: readonly string[]) =>
    user?.roles.some((role) => roles.includes(role)) ?? false;
  const items: NavItem[] = [{ to: "/", label: "Agenda", exact: true }];
  if (has(IMPORT_ROLES)) items.push({ to: "/importar", label: "Importar" });
  if (has(SEMESTER_ROLES)) items.push({ to: "/semestres", label: "Semestres" });
  if (has(ADMIN_ROLES)) items.push({ to: "/admin/contas", label: "Administração" });
  return items;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "?";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

function Brand() {
  return (
    <Link to="/" className="flex min-w-0 items-center gap-2.5 rounded-lg">
      <span
        aria-hidden="true"
        className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground"
      >
        <CalendarDays className="size-5" />
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-sm font-bold tracking-tight">Reserva de Espaços</span>
        <small className="block truncate text-xs font-medium text-muted-foreground">
          IFSC Garopaba
        </small>
      </span>
    </Link>
  );
}

const PILL =
  "rounded-full px-3.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground";
const PILL_ACTIVE = "bg-surface-2 text-foreground shadow-[inset_0_-2px_0_var(--accent)]";

/** Estrutura base das páginas: barra superior no estilo agenda limpa, navegação por papel e área principal. */
export function AppShell({ children, wide = false }: Props) {
  const width = wide ? "max-w-6xl" : "max-w-3xl";
  const user = useSessionUser();
  const items = navItems(user);
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <a
        href="#conteudo"
        className="sr-only z-50 rounded-lg bg-background px-4 py-2 text-sm font-semibold focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Pular para o conteúdo
      </a>
      <header className="sticky top-0 z-20 border-b bg-background">
        <div className="mx-auto flex min-h-16 w-full max-w-6xl items-center gap-2 px-4 py-2 sm:px-6">
          <Brand />
          <nav aria-label="Principal" className="ml-3 hidden items-center gap-1 md:flex">
            {items.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                activeOptions={{ exact: item.exact === true }}
                className={PILL}
                activeProps={{ className: cn(PILL, PILL_ACTIVE) }}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex-1" />
          {user !== null ? (
            <div className="hidden items-center gap-2 md:flex">
              <span
                aria-hidden="true"
                className="grid size-9 place-items-center rounded-full border bg-surface-2 text-xs font-bold"
              >
                {initials(user.name)}
              </span>
              <span className="max-w-40 truncate text-sm font-medium">{user.name}</span>
              <form method="post" action="/api/sair">
                <Button type="submit" variant="outline" size="sm">
                  Sair
                </Button>
              </form>
            </div>
          ) : (
            <Button asChild size="sm" className="hidden md:inline-flex">
              <Link to="/entrar">Entrar</Link>
            </Button>
          )}
          {user === null && (
            <Button asChild size="sm" className="md:hidden">
              <Link to="/entrar">Entrar</Link>
            </Button>
          )}
          <ThemeToggle />
          {/* Visitante só teria "Agenda" (a marca já leva a ela): sem menu, sobra espaço ao nome. */}
          {user !== null && <MobileMenu items={items} user={user} />}
        </div>
      </header>
      <main
        id="conteudo"
        tabIndex={-1}
        className={cn("mx-auto w-full flex-1 px-4 py-8 outline-none sm:px-6", width)}
      >
        {children}
      </main>
    </div>
  );
}

/** Menu do celular: botão com aria-expanded que abre um painel com links por papel e Sair/Entrar. */
function MobileMenu({ items, user }: { items: NavItem[]; user: SessionInfo["user"] }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const root = useRef<HTMLDivElement>(null);

  // Fecha com Esc (devolvendo o foco ao botão) e ao tocar fora do menu.
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      const hadFocus = root.current?.contains(document.activeElement) ?? false;
      setOpen(false);
      if (hadFocus) root.current?.querySelector("button")?.focus();
    }
    function onPointer(event: PointerEvent) {
      if (root.current !== null && !root.current.contains(event.target as Node)) setOpen(false);
    }
    // Fecha quando o foco sai do menu (Tab para fora); ignora a troca de foco entre itens dele.
    function onFocusOut(event: FocusEvent) {
      const next = event.relatedTarget;
      if (next instanceof Node && root.current !== null && !root.current.contains(next)) {
        setOpen(false);
      }
    }
    const container = root.current;
    container?.addEventListener("focusout", onFocusOut);
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      container?.removeEventListener("focusout", onFocusOut);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  const itemClass =
    "flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm font-medium hover:bg-surface-2";
  return (
    <div ref={root} className="relative md:hidden">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Menu"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
      </Button>
      {open && (
        <div
          id={panelId}
          className="absolute top-full right-0 z-30 mt-2 grid w-60 gap-0.5 rounded-xl border bg-popover p-1.5 text-popover-foreground shadow-lg"
        >
          {user !== null && (
            <p className="truncate border-b px-3 pt-1.5 pb-2.5 text-sm font-semibold">
              {user.name}
            </p>
          )}
          {items.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              activeOptions={{ exact: item.exact === true }}
              className={itemClass}
              activeProps={{ className: cn(itemClass, "bg-surface-2") }}
              onClick={() => setOpen(false)}
            >
              {item.label}
            </Link>
          ))}
          {user !== null && (
            <form method="post" action="/api/sair" className="mt-1 border-t pt-1">
              <button type="submit" className={itemClass}>
                Sair
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
