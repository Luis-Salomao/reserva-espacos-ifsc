import { Link, useRouteContext, useRouterState } from "@tanstack/react-router";
import {
  CalendarDays,
  CalendarRange,
  ChevronRight,
  ChevronsUpDown,
  FileUp,
  ListChecks,
  LogOut,
  type LucideIcon,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Users,
  Wrench,
  X,
} from "lucide-react";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import ifscGaropabaLogoClaro from "#/assets/ifsc-garopaba-horizontal.png";
import ifscGaropabaLogoEscuro from "#/assets/ifsc-garopaba-horizontal-escuro.png";
import ifscGaropabaLogoNegativo from "#/assets/ifsc-garopaba-horizontal-negativo.png";
import ifscSimboloNegativo from "#/assets/ifsc-symbol-negativo.svg";
import { Avatar } from "#/components/avatar";
import { ThemeToggle } from "#/components/theme-toggle";
import { Button } from "#/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "#/components/ui/popover";
import { cn } from "#/lib/utils";
import {
  ADMIN_ROLES,
  IMPORT_ROLES,
  SEMESTER_ROLES,
  type SessionInfo,
  SPACE_INFO_ROLES,
} from "#/server/session";

type Props = { children: ReactNode; wide?: boolean };

type NavItem = {
  to:
    | "/"
    | "/minhas-reservas"
    | "/importar"
    | "/semestres"
    | "/admin/contas"
    | "/manutencao/espacos";
  label: string;
  exact?: true;
};

const NAV_ICONS: Record<NavItem["to"], LucideIcon> = {
  "/": CalendarDays,
  "/minhas-reservas": ListChecks,
  "/importar": FileUp,
  "/semestres": CalendarRange,
  "/admin/contas": Users,
  "/manutencao/espacos": Wrench,
};

/** Frase curta (até ~60 caracteres) que explica cada tela, mostrada na barra superior. */
export const SCREEN_HINTS: Record<NavItem["to"], string> = {
  "/": "Veja os horários e a disponibilidade das salas",
  "/minhas-reservas": "Veja e gerencie as suas reservas",
  "/importar": "Importe a grade de horários do aSc",
  "/semestres": "Configure semestres e durações",
  "/admin/contas": "Gerencie contas e espaços",
  "/manutencao/espacos": "Atualize as informações das salas",
};

const ROLE_LABELS: Record<string, string> = {
  admin: "Administração",
  horarios: "Horários",
  docente: "Docente",
  manutencao: "Manutenção",
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
  if (has(SPACE_INFO_ROLES)) items.push({ to: "/manutencao/espacos", label: "Manutenção" });
  return items;
}

const SYSTEM_NAME = "Sistema de Reserva de Espaços";
const SYSTEM_TAGLINE = "Consulte a ocupação das salas e reserve espaços do IFSC Câmpus Garopaba.";

/** Logo do IFSC com o nome do sistema ao lado (quebra de linha, sem reticências). */
function Brand({ stacked = false }: { stacked?: boolean }) {
  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-2",
        stacked && "md:flex-col md:items-start md:gap-1",
      )}
    >
      <BrandLogo onSidebar={stacked} />
      {/* Na lateral do computador o nome do sistema vai para a barra superior da área de conteúdo. */}
      <div className={cn("min-w-0 leading-tight", stacked && "md:hidden")}>
        <p className="text-[11px] font-semibold sm:text-sm">{SYSTEM_NAME}</p>
        <p className="mt-0.5 hidden text-xs text-muted-foreground sm:block">{SYSTEM_TAGLINE}</p>
      </div>
    </div>
  );
}

/**
 * Marca oficial com fundo transparente. No tema escuro as letras pretas viram brancas; sobre a
 * lateral verde do computador entra a versão negativa (quadrados e letras brancos, bolinha
 * vermelha), sem placa branca.
 */
function BrandLogo({ onSidebar = false }: { onSidebar?: boolean }) {
  const size = "h-auto w-[112px] shrink-0 sm:w-[128px]";
  return (
    <Link
      to="/"
      aria-label="IFSC Câmpus Garopaba — Reserva de espaços"
      className="flex shrink-0 items-center rounded-md px-1 py-1.5"
    >
      <img
        src={ifscGaropabaLogoClaro}
        alt=""
        aria-hidden="true"
        className={cn("block dark:hidden", size, onSidebar && "md:hidden")}
      />
      <img
        src={ifscGaropabaLogoEscuro}
        alt=""
        aria-hidden="true"
        className={cn("hidden dark:block", size, onSidebar && "md:hidden md:dark:hidden")}
      />
      {onSidebar && (
        <img
          src={ifscGaropabaLogoNegativo}
          alt=""
          aria-hidden="true"
          data-logo="negativo"
          className={cn("hidden md:block md:w-[150px]", size)}
        />
      )}
    </Link>
  );
}

const NAV_LINK =
  "flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-background/60 hover:text-foreground";
/* Item ativo: pílula verde clara com um traço vermelho do IFSC à esquerda (o vermelho do logo). */
const NAV_LINK_ACTIVE =
  "relative bg-background font-semibold text-foreground before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-full before:bg-brand-red";
const NAV_ICON_SLOT = "grid size-5 shrink-0 place-items-center";
const NAV_ICON = "block size-4 shrink-0";

function NavigationIcon({ icon: Icon, muted = false }: { icon: LucideIcon; muted?: boolean }) {
  return (
    <span className={NAV_ICON_SLOT} aria-hidden="true">
      <Icon className={cn(NAV_ICON, muted && "text-muted-foreground")} />
    </span>
  );
}

/**
 * Estrutura base das páginas. No computador a barra é lateral (navegação, conta e tema);
 * no celular vira uma barra superior com menu.
 */
export function AppShell({ children, wide = false }: Props) {
  const user = useSessionUser();
  const items = navItems(user);
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("sidebar-collapsed") === "true");
    } catch {
      /* Preferencia apenas nesta visita. */
    }
  }, []);
  function toggleSidebar() {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem("sidebar-collapsed", String(next));
    } catch {
      /* Preferencia apenas nesta visita. */
    }
  }
  if (user === null) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <a href="#conteudo" className="sr-only focus:not-sr-only">
          Pular para o conteúdo
        </a>
        <header className="sticky top-0 z-30 flex min-h-14 items-center justify-between gap-3 border-b bg-background px-4 sm:px-6">
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
      <header
        className={cn(
          "menu-forte sticky top-0 z-30 flex min-h-14 items-center gap-1 border-b bg-background/90 px-3 backdrop-blur md:fixed md:inset-y-0 md:left-0 md:min-h-0 md:flex-col md:items-stretch md:gap-0 md:border-r-0 md:border-b-0 md:bg-sidebar md:px-3 md:pt-0 md:pb-3 md:backdrop-blur-none",
          collapsed ? "md:w-16 md:px-2" : "md:w-60",
        )}
      >
        {/* Topo da lateral com a altura da barra superior: as duas linhas de baixo se alinham. */}
        <div
          className={cn(
            "flex min-w-0 items-center gap-1 md:-mx-3 md:h-14 md:shrink-0 md:border-b md:px-3",
            collapsed && "md:-mx-2 md:justify-center md:px-2",
          )}
        >
          <div className={cn("min-w-0 flex-1", collapsed && "md:hidden")}>
            <Brand stacked />
          </div>
          {collapsed && (
            <Link
              to="/"
              aria-label="IFSC Câmpus Garopaba — Reserva de espaços"
              className="hidden rounded-md p-1 md:block"
            >
              <img
                src={ifscSimboloNegativo}
                alt=""
                aria-hidden="true"
                data-logo="simbolo"
                className="block h-8 w-auto"
              />
            </Link>
          )}
          {!collapsed && <SidebarToggle collapsed={collapsed} onToggle={toggleSidebar} />}
        </div>
        {collapsed && (
          <div className="mt-3 hidden justify-center md:flex">
            <SidebarToggle collapsed={collapsed} onToggle={toggleSidebar} />
          </div>
        )}
        <nav aria-label="Principal" className="mt-5 hidden flex-col gap-0.5 md:flex">
          {items.map((item) => {
            const Icon = NAV_ICONS[item.to];
            return (
              <Link
                key={item.to}
                to={item.to}
                activeOptions={{ exact: item.exact === true, includeSearch: false }}
                title={item.label}
                className={cn(NAV_LINK, collapsed && "md:justify-center md:px-0")}
                activeProps={{
                  className: cn(
                    NAV_LINK,
                    NAV_LINK_ACTIVE,
                    collapsed && "md:justify-center md:px-0",
                  ),
                }}
              >
                <NavigationIcon icon={Icon} />
                <span className={cn(collapsed && "md:sr-only")}>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="flex-1" />
        <div
          className={cn(
            "flex items-center gap-1 md:border-t md:pt-3",
            collapsed && "md:flex-col md:items-center",
          )}
        >
          {user !== null ? (
            <>
              <AccountMenu user={user} collapsed={collapsed} />
              <ThemeToggle />
            </>
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
      <div className={collapsed ? "md:pl-16" : "md:pl-60"}>
        <ScreenBar items={items} />
        <main
          id="conteudo"
          tabIndex={-1}
          className={cn(
            "mx-auto w-full px-4 py-6 outline-none sm:px-6 md:pt-4 md:pb-8",
            wide ? "max-w-[1440px]" : "max-w-3xl",
          )}
        >
          {children}
        </main>
      </div>
    </div>
  );
}

function SidebarToggle({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const label = collapsed ? "Expandir menu lateral" : "Recolher menu lateral";
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="hidden shrink-0 md:inline-flex"
      aria-label={label}
      aria-expanded={!collapsed}
      onClick={onToggle}
      title={label}
    >
      {collapsed ? <PanelLeftOpen aria-hidden="true" /> : <PanelLeftClose aria-hidden="true" />}
    </Button>
  );
}

/** Item de navegação da tela atual (pelo primeiro trecho do caminho); `undefined` fora do menu. */
function activeItem(items: NavItem[], pathname: string): NavItem | undefined {
  const segment = (path: string) => path.split("/")[1] ?? "";
  return items.find((item) =>
    item.exact === true ? pathname === item.to : segment(pathname) === segment(item.to),
  );
}

/**
 * Barra no topo da área de conteúdo (só no computador, usuário logado): nome do sistema e frase
 * curta sobre a tela atual. Não é título (h1): cada página tem o seu.
 */
function ScreenBar({ items }: { items: NavItem[] }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const current = activeItem(items, pathname);
  return (
    <nav
      aria-label="Localização"
      className="sticky top-0 z-40 hidden min-h-14 items-center gap-x-2 border-b border-divider bg-menu-soft px-6 text-foreground md:flex"
    >
      <p className="flex min-w-0 flex-wrap items-center gap-x-2 text-sm">
        <span className="font-semibold">{SYSTEM_NAME}</span>
        {current !== undefined && (
          <>
            <ChevronRight className="size-4 shrink-0 text-brand-red" aria-hidden="true" />
            <span className="text-muted-foreground">{SCREEN_HINTS[current.to]}</span>
          </>
        )}
      </p>
    </nav>
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
                activeOptions={{ exact: item.exact === true, includeSearch: false }}
                className={itemClass}
                activeProps={{ className: cn(itemClass, "bg-surface-2") }}
                onClick={() => setOpen(false)}
              >
                <NavigationIcon icon={Icon} muted />
                {item.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Identificação da conta e saída no avatar, com foco e teclado geridos pelo Popover. */
function AccountMenu({
  user,
  collapsed,
}: {
  user: NonNullable<SessionInfo["user"]>;
  collapsed: boolean;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Conta de ${user.name}`}
          className="flex min-h-11 min-w-11 items-center justify-center gap-2.5 rounded-full p-1.5 transition-colors hover:bg-surface-2 md:w-full md:justify-start md:rounded-lg"
        >
          <Avatar name={user.name} className="size-9 text-xs" />
          <span
            className={cn(
              "hidden min-w-0 flex-1 text-left leading-tight",
              !collapsed && "md:block",
            )}
          >
            <span className="block truncate text-[13px] font-medium">{user.name}</span>
            <small className="block truncate text-[11px] text-muted-foreground">
              {user.roles.map((role) => ROLE_LABELS[role] ?? role).join(" · ")}
            </small>
          </span>
          <ChevronsUpDown
            className={cn("hidden size-3.5 text-muted-foreground", !collapsed && "md:block")}
            aria-hidden="true"
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="top"
        sideOffset={10}
        className="w-64 p-2"
        aria-label="Conta do usuário"
      >
        <div className="border-b px-2 py-3">
          <p className="truncate text-sm font-semibold">{user.name}</p>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
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
