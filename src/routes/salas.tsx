import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import type { RoomsDay, RoomsWeek } from "#/application/bookings";
import { AppShell } from "#/components/app-shell";
import { RoomsView, type SalasSearch } from "#/components/rooms/rooms-view";
import { localNow } from "#/domain/availability";
import { weekOf } from "#/domain/overview";
import { isValidDate, isValidTime } from "#/domain/semester";
import { getRoomsDayFn, getRoomsWeekFn } from "#/server/booking-fns";
import { ADMIN_ROLES, BOOKING_ROLES, canViewHome, type SessionInfo } from "#/server/session";

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
  const visao =
    search.visao === "colunas" || search.visao === "livres" || search.visao === "geral"
      ? search.visao
      : undefined;
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

type Response<T> = { ok: true; data: T } | { ok: false; message: string };

export type SalasLoaderData = {
  selectedDate: string;
  roomsDay: RoomsDay | null;
  roomsWeek: RoomsWeek | null;
  error: string | null;
  isVisitor: boolean;
  canBook: boolean;
  isAdmin: boolean;
  session: SessionInfo;
};

/** Visão geral: em vez do dia, pede a semana (segunda a sexta) da data. */
type WeekOptions = {
  geral: boolean;
  fetchWeek: (weekStart: string) => Promise<Response<RoomsWeek>>;
};

async function dataOf<T>(request: () => Promise<Response<T>>): Promise<T | null> {
  try {
    const result = await request();
    return result.ok ? result.data : null;
  } catch {
    return null;
  }
}

/**
 * Carrega o dia (hoje, sem data válida) numa única chamada; na visão geral, só a semana desse
 * dia, também numa chamada. Falha vira mensagem sem dados.
 */
export async function loadSalas(
  date: string | undefined,
  session: SessionInfo,
  fetchDay: (date: string) => Promise<Response<RoomsDay>>,
  now: Date = new Date(),
  week?: WeekOptions,
): Promise<SalasLoaderData> {
  const { user } = session;
  const has = (roles: readonly string[]) =>
    user?.roles.some((role) => roles.includes(role)) ?? false;
  const selectedDate = date ?? localNow(now, session.timeZone).slice(0, 10);
  const geral = week?.geral === true;
  const roomsWeek = geral
    ? await dataOf(() => week.fetchWeek(weekOf(selectedDate)[0] ?? selectedDate))
    : null;
  const roomsDay = geral ? null : await dataOf(() => fetchDay(selectedDate));
  return {
    selectedDate,
    roomsDay,
    roomsWeek,
    error: (geral ? roomsWeek : roomsDay) === null ? LOAD_ERROR : null,
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
  // Só o dia (ou a semana, na visão geral) vai ao servidor; filtros e janela são aplicados no cliente.
  loaderDeps: ({ search: { data, visao } }) => ({ data, geral: visao === "geral" }),
  loader: ({ deps, context }) =>
    loadSalas(deps.data, context.session, (date) => getRoomsDayFn({ data: { date } }), new Date(), {
      geral: deps.geral,
      fetchWeek: (weekStart) => getRoomsWeekFn({ data: { weekStart } }),
    }),
  component: SalasPage,
});

function SalasPage() {
  const data = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const router = useRouter();
  return (
    <AppShell wide>
      <RoomsView
        roomsDay={data.roomsDay}
        error={data.error}
        selectedDate={data.selectedDate}
        search={search}
        canBook={data.canBook}
        isVisitor={data.isVisitor}
        isAdmin={data.isAdmin}
        timeZone={data.session.timeZone}
        onSearchChange={(update, replace) => void navigate({ search: update, replace })}
        onRetry={() => void router.invalidate()}
      />
    </AppShell>
  );
}
