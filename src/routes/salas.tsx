import { createFileRoute, redirect } from "@tanstack/react-router";
import type { RoomsDay } from "#/application/bookings";
import { AppShell } from "#/components/app-shell";
import { PageHeader } from "#/components/page";
import { localNow } from "#/domain/availability";
import { isValidDate, isValidTime } from "#/domain/semester";
import { getRoomsDayFn } from "#/server/booking-fns";
import { ADMIN_ROLES, BOOKING_ROLES, canViewHome, type SessionInfo } from "#/server/session";

export type SalasView = "colunas" | "livres";

export type SalasSearch = {
  data?: string;
  visao?: SalasView;
  bloco?: string[];
  cap?: number;
  q?: string;
  ini?: string;
  fim?: string;
  livres?: true;
};

const LOAD_ERROR = "Não foi possível carregar as salas";
const MAX_QUERY = 60;
const BLOCK = /^(?:[A-Z]|Outros)$/;

function blocksFrom(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : [value];
  const blocks = raw
    .filter((item): item is string => typeof item === "string")
    .map((item) => (item.length === 1 ? item.toUpperCase() : item))
    .filter((item) => BLOCK.test(item));
  return [...new Set(blocks)];
}

function capacityFrom(value: unknown): number | undefined {
  const parsed =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 999 ? parsed : undefined;
}

function queryFrom(value: unknown): string | undefined {
  const raw = typeof value === "number" ? String(value) : value;
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim().slice(0, MAX_QUERY);
  return trimmed.length > 0 ? trimmed : undefined;
}

const timeFrom = (value: unknown) =>
  typeof value === "string" && isValidTime(value) ? value : undefined;

/**
 * Parâmetros de `/salas`: data, visão, blocos, capacidade mínima (1–999), busca, janela e "só
 * livres". Valores inválidos são descartados; blocos sem nenhuma sala são ignorados no filtro.
 */
export function validateSalasSearch(search: Record<string, unknown>): SalasSearch {
  const data =
    typeof search.data === "string" && isValidDate(search.data) ? search.data : undefined;
  const visao = search.visao === "colunas" || search.visao === "livres" ? search.visao : undefined;
  const bloco = blocksFrom(search.bloco);
  const cap = capacityFrom(search.cap);
  const q = queryFrom(search.q);
  const ini = timeFrom(search.ini);
  const fim = timeFrom(search.fim);
  const livres = search.livres === true || search.livres === "true";
  return {
    ...(data !== undefined ? { data } : {}),
    ...(visao !== undefined ? { visao } : {}),
    ...(bloco.length > 0 ? { bloco } : {}),
    ...(cap !== undefined ? { cap } : {}),
    ...(q !== undefined ? { q } : {}),
    ...(ini !== undefined ? { ini } : {}),
    ...(fim !== undefined ? { fim } : {}),
    ...(livres ? { livres: true as const } : {}),
  };
}

type DayResponse = { ok: true; data: RoomsDay } | { ok: false; message: string };

export type SalasLoaderData = {
  selectedDate: string;
  roomsDay: RoomsDay | null;
  error: string | null;
  isVisitor: boolean;
  canBook: boolean;
  isAdmin: boolean;
  session: SessionInfo;
};

/** Carrega o dia (hoje, sem data válida) numa única chamada; falha vira mensagem sem dados. */
export async function loadSalas(
  date: string | undefined,
  session: SessionInfo,
  fetchDay: (date: string) => Promise<DayResponse>,
  now: Date = new Date(),
): Promise<SalasLoaderData> {
  const { user } = session;
  const has = (roles: readonly string[]) =>
    user?.roles.some((role) => roles.includes(role)) ?? false;
  const selectedDate = date ?? localNow(now, session.timeZone).slice(0, 10);
  let roomsDay: RoomsDay | null = null;
  try {
    const result = await fetchDay(selectedDate);
    if (result.ok) roomsDay = result.data;
  } catch {
    roomsDay = null;
  }
  return {
    selectedDate,
    roomsDay,
    error: roomsDay === null ? LOAD_ERROR : null,
    isVisitor: user === null,
    canBook: has(BOOKING_ROLES),
    isAdmin: has(ADMIN_ROLES),
    session,
  };
}

export const Route = createFileRoute("/salas")({
  validateSearch: validateSalasSearch,
  // Com PUBLIC_READ=false a tela exige login, como a agenda.
  beforeLoad: ({ context, location }) => {
    const { user, publicRead } = context.session;
    if (!canViewHome(publicRead, user)) {
      throw redirect({
        to: "/entrar",
        search: { voltar: `${location.pathname}${location.searchStr ?? ""}` },
      });
    }
  },
  // Só o dia vai ao servidor; filtros e janela são aplicados no cliente.
  loaderDeps: ({ search: { data } }) => ({ data }),
  loader: ({ deps, context }) =>
    loadSalas(deps.data, context.session, (date) => getRoomsDayFn({ data: { date } })),
  component: SalasPage,
});

function SalasPage() {
  return (
    <AppShell wide>
      <PageHeader title="Todas as salas" />
    </AppShell>
  );
}
