import { Link, useRouteContext } from "@tanstack/react-router";
import {
  CalendarDays,
  CalendarRange,
  FileUp,
  ListChecks,
  LogOut,
  type LucideIcon,
  Menu,
  Users,
  X,
} from "lucide-react";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { Avatar } from "#/components/avatar";
import { ThemeToggle } from "#/components/theme-toggle";
import { Button } from "#/components/ui/button";
import { cn } from "#/lib/utils";
import { ADMIN_ROLES, IMPORT_ROLES, SEMESTER_ROLES, type SessionInfo } from "#/server/session";

type Props = { children: ReactNode; wide?: boolean };

type NavItem = {
  to: "/" | "/minhas-reservas" | "/importar" | "/semestres" | "/admin/contas";
  label: string;
  exact?: true;
};

const NAV_ICONS: Record<NavItem["to"], LucideIcon> = {
  "/": CalendarDays,
  "/minhas-reservas": ListChecks,
  "/importar": FileUp,
  "/semestres": CalendarRange,
  "/admin/contas": Users,
};

const ROLE_LABELS: Record<string, string> = {
  admin: "Administração",
  horarios: "Horários",
  docente: "Docente",
};

/** Lê o usuário do contexto da raiz (ausente em roteadores de teste sem sessão). */
function useSessionUser(): SessionInfo["user"] {
  const context: { session?: SessionInfo } = useRouteContext({ strict: false });
  return context.session?.user ?? null;
}

/** Papéis que têm página pessoal de Minhas reservas no menu. */
const MY_BOOKINGS_ROLES = ["admin", "docente"] as const;

/** Itens de navegação visíveis conforme os papéis. */
export function navItems(user: SessionInfo["user"]): NavItem[] {
  const has = (roles: readonly string[]) =>
    user?.roles.some((role) => roles.includes(role)) ?? false;
  const items: NavItem[] = [{ to: "/", label: "Agenda", exact: true }];
  if (has(MY_BOOKINGS_ROLES)) items.push({ to: "/minhas-reservas", label: "Minhas reservas" });
  if (has(IMPORT_ROLES)) items.push({ to: "/importar", label: "Importar" });
  if (has(SEMESTER_ROLES)) items.push({ to: "/semestres", label: "Semestres" });
  if (has(ADMIN_ROLES)) items.push({ to: "/admin/contas", label: "Administração" });
  return items;
}

function Brand() {
  return (
    <Link
      to="/"
      className="min-w-0 truncate rounded-md text-[14px] font-semibold tracking-tight md:px-2 md:py-1.5"
    >
      Reserva de Espaços
    </Link>
  );
}

const NAV_LINK =
  "flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground";
const NAV_LINK_ACTIVE = "bg-surface-2 text-foreground";

/**
 * Estrutura base das páginas. No computador a barra é lateral (navegação, conta e tema);
 * no celular vira uma barra superior com menu.
 */
export function AppShell({ children, wide = false }: Props) {
  const user = useSessionUser();
  const items = navItems(user);
  return (
    <div className="min-h-screen bg-background text-foreground">
      <a
        href="#conteudo"
        className="sr-only z-50 rounded-md bg-background px-4 py-2 text-sm font-semibold focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Pular para o conteúdo
      </a>
      <header className="sticky top-0 z-30 flex h-14 items-center gap-1 border-b bg-background/90 px-3 backdrop-blur md:fixed md:inset-y-0 md:left-0 md:h-auto md:w-60 md:flex-col md:items-stretch md:gap-0 md:border-r md:border-b-0 md:bg-surface md:px-3 md:py-3 md:backdrop-blur-none">
        <Brand />
        <nav aria-label="Principal" className="mt-5 hidden flex-col gap-0.5 md:flex">
          {items.map((item) => {
            const Icon = NAV_ICONS[item.to];
            return (
              <Link
                key={item.to}
                to={item.to}
                activeOptions={{ exact: item.exact === true }}
                className={NAV_LINK}
                activeProps={{ className: cn(NAV_LINK, NAV_LINK_ACTIVE) }}
              >
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex-1" />
        <div className="flex items-center gap-1 md:border-t md:pt-3">
          {user !== null ? (
            <div className="hidden min-w-0 flex-1 items-center gap-2 md:flex">
              <Avatar name={user.name} />
              <span className="min-w-0 leading-tight">
                <span className="block truncate text-[13px] font-medium">{user.name}</span>
                <small className="block truncate text-[11px] text-muted-foreground">
                  {user.roles.map((role) => ROLE_LABELS[role] ?? role).join(" · ")}
                </small>
              </span>
            </div>
          ) : (
            <Button asChild size="sm" className="hidden flex-1 md:inline-flex">
              <Link to="/entrar">Entrar</Link>
            </Button>
          )}
          {user === null && (
            <Button asChild size="sm" className="md:hidden">
              <Link to="/entrar">Entrar</Link>
            </Button>
          )}
          <ThemeToggle />
          {user !== null && (
            <form method="post" action="/api/sair" className="hidden md:block">
              <Button type="submit" variant="ghost" size="icon" aria-label="Sair" title="Sair">
                <LogOut aria-hidden="true" />
              </Button>
            </form>
          )}
          {/* Visitante só teria "Agenda" (a marca já leva a ela): sem menu, sobra espaço ao nome. */}
          {user !== null && <MobileMenu items={items} user={user} />}
        </div>
      </header>
      <div className="md:pl-60">
        <main
          id="conteudo"
          tabIndex={-1}
          className={cn(
            "mx-auto w-full px-4 py-6 outline-none sm:px-6 md:py-8",
            wide ? "max-w-[1440px]" : "max-w-3xl",
          )}
        >
          {children}
        </main>
      </div>
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
    "flex min-h-11 w-full items-center gap-2.5 rounded-md px-3 text-left text-sm font-medium hover:bg-surface-2";
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
          className="absolute top-full right-0 z-30 mt-2 grid w-64 gap-0.5 rounded-lg border bg-popover p-1.5 text-popover-foreground shadow-lg"
        >
          {user !== null && (
            <div className="flex items-center gap-2.5 border-b px-3 pt-1.5 pb-2.5">
              <Avatar name={user.name} />
              <p className="truncate text-sm font-semibold">{user.name}</p>
            </div>
          )}
          {items.map((item) => {
            const Icon = NAV_ICONS[item.to];
            return (
              <Link
                key={item.to}
                to={item.to}
                activeOptions={{ exact: item.exact === true }}
                className={itemClass}
                activeProps={{ className: cn(itemClass, "bg-surface-2") }}
                onClick={() => setOpen(false)}
              >
                <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
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
