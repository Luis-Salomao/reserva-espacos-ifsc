import { Link, useRouteContext } from "@tanstack/react-router";
import {
  CalendarDays,
  CalendarRange,
  ChevronsUpDown,
  FileUp,
  ListChecks,
  LogOut,
  type LucideIcon,
  Menu,
  Settings,
  Users,
  X,
} from "lucide-react";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { Avatar } from "#/components/avatar";
import { ThemeToggle } from "#/components/theme-toggle";
import { Button } from "#/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "#/components/ui/popover";
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
  if (user === null) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <a href="#conteudo" className="sr-only focus:not-sr-only">
          Pular para o conteúdo
        </a>
        <header className="flex h-14 items-center justify-between gap-3 border-b px-4 sm:px-6">
          <Brand />
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button asChild size="sm">
              <Link to="/entrar">Entrar</Link>
            </Button>
          </div>
        </header>
        <main
          id="conteudo"
          tabIndex={-1}
          className={cn(
            "mx-auto w-full px-4 py-6 outline-none sm:px-6",
            wide ? "max-w-[1440px]" : "max-w-3xl",
          )}
        >
          {children}
        </main>
      </div>
    );
  }
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
            <AccountMenu user={user} />
          ) : (
            <>
              <Button asChild size="sm" className="hidden flex-1 md:inline-flex">
                <Link to="/entrar">Entrar</Link>
              </Button>
              <Button asChild size="sm" className="md:hidden">
                <Link to="/entrar">Entrar</Link>
              </Button>
              <ThemeToggle />
            </>
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
        </div>
      )}
    </div>
  );
}

/** Preferências e saída reunidas no avatar, com foco e teclado geridos pelo Popover. */
function AccountMenu({ user }: { user: NonNullable<SessionInfo["user"]> }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Configurações de ${user.name}`}
          className="flex min-h-11 min-w-11 items-center justify-center gap-2.5 rounded-full p-1.5 transition-colors hover:bg-surface-2 md:w-full md:justify-start md:rounded-lg"
        >
          <Avatar name={user.name} className="size-9 text-xs" />
          <span className="hidden min-w-0 flex-1 text-left leading-tight md:block">
            <span className="block truncate text-[13px] font-medium">{user.name}</span>
            <small className="block truncate text-[11px] text-muted-foreground">
              {user.roles.map((role) => ROLE_LABELS[role] ?? role).join(" · ")}
            </small>
          </span>
          <ChevronsUpDown
            className="hidden size-3.5 text-muted-foreground md:block"
            aria-hidden="true"
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="top"
        sideOffset={10}
        className="w-64 p-2"
        aria-label="Configurações da conta"
      >
        <div className="border-b px-2 py-3">
          <p className="truncate text-sm font-semibold">{user.name}</p>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
        </div>
        <div className="flex items-center gap-2 px-2 pt-3 pb-1 text-xs font-medium text-muted-foreground">
          <Settings className="size-3.5" aria-hidden="true" />
          Configurações
        </div>
        <div className="flex items-center justify-between px-2 py-1">
          <span className="text-sm">Aparência</span>
          <ThemeToggle />
        </div>
        <form method="post" action="/api/sair" className="mt-1 border-t pt-1">
          <Button type="submit" variant="ghost" className="w-full justify-start">
            <LogOut aria-hidden="true" />
            Sair
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
