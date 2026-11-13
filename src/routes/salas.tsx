import { createFileRoute, redirect } from "@tanstack/react-router";
import type { RoomsDay, RoomsRange } from "#/application/bookings";
import type { SalasSearch } from "#/components/rooms/rooms-view";
import { localNow } from "#/domain/availability";
import { rangeIssue, resolveRange } from "#/domain/overview";
import { isValidDate, isValidTime } from "#/domain/semester";
import type { Space } from "#/domain/space";
import { ADMIN_ROLES, BOOKING_ROLES, type SessionInfo } from "#/server/session";

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

function floorsFrom(value: unknown): number[] {
  const raw = Array.isArray(value) ? value : [value];
  const floors = raw
    .filter((item) => typeof item === "number" || (typeof item === "string" && item !== ""))
    .map(Number)
    .filter((item) => Number.isInteger(item) && item >= 0 && item <= 9);
  return [...new Set(floors)];
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

const dateFrom = (value: unknown) =>
  typeof value === "string" && isValidDate(value) ? value : undefined;

/**
 * Intervalo da visão geral na URL: `de` e `ate` válidos, `de <= ate` e até 31 dias. Só `de` vale
 * (o fim é `de` + 6); o `data` antigo vira `de`. Qualquer inconsistência cai no padrão (nada na URL).
 */
function rangeParams(search: Record<string, unknown>): { de?: string; ate?: string } {
  const ate = dateFrom(search.ate);
  const de = dateFrom(search.de) ?? (ate === undefined ? dateFrom(search.data) : undefined);
  if (de === undefined) return {};
  const range = resolveRange(de, ate, de);
  return rangeIssue(range.from, range.to) === null
    ? { de, ...(ate !== undefined ? { ate } : {}) }
    : {};
}

/**
 * Parâmetros das visualizações de salas: data, visão, blocos, andares (0–9), capacidade mínima
 * (1–999), busca, janela e "só livres". Valores inválidos são descartados; blocos e andares sem
 * nenhuma sala são ignorados no filtro.
 */
export function validateSalasSearch(search: Record<string, unknown>): SalasSearch {
  const visao =
    search.visao === "colunas" || search.visao === "livres" || search.visao === "geral"
      ? search.visao
      : undefined;
  // `de`/`ate` só existem na visão geral; nas demais vale o `data` de um dia.
  const range = visao === "geral" ? rangeParams(search) : {};
  const data = visao === "geral" ? undefined : dateFrom(search.data);
  const bloco = blocksFrom(search.bloco);
  const andar = floorsFrom(search.andar);
  const cap = capacityFrom(search.cap);
  const q = queryFrom(search.q);
  const ini = timeFrom(search.ini);
  const fim = timeFrom(search.fim);
  const livres = search.livres === true || search.livres === "true";
  const projetor = search.projetor === true || search.projetor === "true";
  const pcs = capacityFrom(search.pcs);
  return {
    ...(data !== undefined ? { data } : {}),
    ...range,
    ...(visao !== undefined ? { visao } : {}),
    ...(bloco.length > 0 ? { bloco } : {}),
    ...(andar.length > 0 ? { andar } : {}),
    ...(cap !== undefined ? { cap } : {}),
    ...(projetor ? { projetor: true as const } : {}),
    ...(pcs !== undefined ? { pcs } : {}),
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
  roomsRange: RoomsRange | null;
  error: string | null;
  isVisitor: boolean;
  canBook: boolean;
  isAdmin: boolean;
  session: SessionInfo;
  /** Espaços com capacidade/equipamentos por id; vazio se `listSpaces()` falhar ou não for lido. */
  spacesIndex: Record<string, Space>;
};

/** Visão geral: em vez do dia, pede o intervalo `de`–`ate` (padrão: hoje até hoje + 6). */
type RangeOptions = {
  geral: boolean;
  de?: string | undefined;
  ate?: string | undefined;
  fetchRange: (range: { from: string; to: string }) => Promise<Response<RoomsRange>>;
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
 * Carrega o dia (hoje, sem data válida) numa única chamada; na visão geral, só o intervalo
 * pedido (`selectedDate` é o primeiro dia), também numa chamada. Falha vira mensagem sem dados.
 */
export async function loadSalas(
  date: string | undefined,
  session: SessionInfo,
  fetchDay: (date: string) => Promise<Response<RoomsDay>>,
  now: Date = new Date(),
  range?: RangeOptions,
): Promise<SalasLoaderData> {
  const { user } = session;
  const has = (roles: readonly string[]) =>
    user?.roles.some((role) => roles.includes(role)) ?? false;
  const today = localNow(now, session.timeZone).slice(0, 10);
  const geral = range?.geral === true;
  const shown = resolveRange(range?.de, range?.ate, today);
  const selectedDate = geral ? shown.from : (date ?? today);
  const roomsRange = geral ? await dataOf(() => range.fetchRange(shown)) : null;
  const roomsDay = geral ? null : await dataOf(() => fetchDay(selectedDate));
  return {
    selectedDate,
    roomsDay,
    roomsRange,
    error: (geral ? roomsRange : roomsDay) === null ? LOAD_ERROR : null,
    isVisitor: user === null,
    canBook: has(BOOKING_ROLES),
    isAdmin: has(ADMIN_ROLES),
    session,
    spacesIndex: {},
  };
}

/** As salas são visualizações de `/`: mesmos parâmetros, "Colunas" quando não há visão. */
export const Route = createFileRoute("/salas")({
  validateSearch: validateSalasSearch,
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/", search: { ...search, visao: search.visao ?? "colunas" } });
  },
});
