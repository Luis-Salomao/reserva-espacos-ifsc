import type {
  BookingsService,
  BookingView,
  DayAgenda,
  MyBooking,
  WeekAgenda,
} from "#/application/bookings";
import type { User } from "#/domain/user";
import {
  type AdminOutcome,
  type AdminResponse,
  asRoles,
  BAD_REQUEST,
  fromResult,
  type RequestLike,
  record,
  reject,
  text,
} from "./admin-actions.ts";
import { type AuthPort, resolveSession } from "./auth-handlers.ts";
import { boundedInt } from "./input.ts";
import { BOOKING_ROLES, type CookieSecureMode } from "./session.ts";

export type BookingDeps = {
  auth: AuthPort;
  bookings: BookingsService;
  cookieSecure: CookieSecureMode;
  /** `PUBLIC_READ`: com `false`, até a leitura da agenda exige sessão. */
  publicRead: boolean;
};

const MAX_OFFSET = 100_000;
const MAX_SERIES = 1000;

/** Visitante só entra se `PUBLIC_READ=true`; o espectador (ou `null`) segue para a consulta. */
async function asReader<T>(
  deps: BookingDeps,
  request: RequestLike,
  run: (viewer: User | null) => Promise<AdminResponse<T>>,
): Promise<AdminOutcome<T>> {
  const { user, setCookie } = await resolveSession(
    request.headers.get("cookie"),
    request.url,
    deps.auth,
    deps.cookieSecure,
  );
  if (user === null && !deps.publicRead) {
    return { response: reject(401, "É preciso entrar."), setCookie: null };
  }
  return { response: await run(user), setCookie };
}

/** Qualquer conta autenticada; as regras de posse ficam no serviço (403 ali). */
async function asAccount<T>(
  deps: BookingDeps,
  request: RequestLike,
  run: (user: User) => Promise<AdminResponse<T>>,
): Promise<AdminOutcome<T>> {
  const { user, setCookie } = await resolveSession(
    request.headers.get("cookie"),
    request.url,
    deps.auth,
    deps.cookieSecure,
  );
  if (user === null) return { response: reject(401, "É preciso entrar."), setCookie: null };
  return { response: await run(user), setCookie };
}

/** Agenda de um dia de um espaço (`{ spaceId, date }`); pública conforme `PUBLIC_READ`. */
export function getDayAgenda(deps: BookingDeps, request: RequestLike, data: unknown) {
  return asReader<DayAgenda>(deps, request, async (viewer) => {
    const body = record(data);
    const spaceId = body && text(body, "spaceId");
    const date = body && text(body, "date");
    if (spaceId == null || date == null) return reject(400, BAD_REQUEST);
    return fromResult(await deps.bookings.dayAgenda(viewer, { spaceId, date }));
  });
}

/** Agenda de sete dias de um espaço (`{ spaceId, weekStart }`). */
export function getWeekAgenda(deps: BookingDeps, request: RequestLike, data: unknown) {
  return asReader<WeekAgenda>(deps, request, async (viewer) => {
    const body = record(data);
    const spaceId = body && text(body, "spaceId");
    const weekStart = body && text(body, "weekStart");
    if (spaceId == null || weekStart == null) return reject(400, BAD_REQUEST);
    return fromResult(await deps.bookings.weekAgenda(viewer, { spaceId, weekStart }));
  });
}

/** Reserva avulsa: `docente`, `horarios` ou `admin`. */
export function createBookingAction(deps: BookingDeps, request: RequestLike, data: unknown) {
  return asRoles<BookingView>(BOOKING_ROLES, deps, request, async (user) => {
    const body = record(data);
    const spaceId = body && text(body, "spaceId");
    const date = body && text(body, "date");
    const start = body && text(body, "start");
    const end = body && text(body, "end");
    const purpose = body && text(body, "purpose");
    if (spaceId == null || date == null || start == null || end == null || purpose == null) {
      return reject(400, BAD_REQUEST);
    }
    const result = await deps.bookings.createBooking(user, { spaceId, date, start, end, purpose });
    const response = fromResult(result);
    if (response.ok || result.ok || result.conflict === undefined) return response;
    const { title, date: day, start: from, end: to } = result.conflict;
    return { ...response, conflict: { title, date: day, start: from, end: to } };
  });
}

/**
 * Cancela uma data (`scope: "data"`) ou a série (`"serie"`); a posse é checada no serviço (403).
 * `expectedCount` opcional (tamanho da prévia): série de outro tamanho -> 409.
 */
export function cancelOccupationAction(deps: BookingDeps, request: RequestLike, data: unknown) {
  return asAccount<{ cancelled: number }>(deps, request, async (user) => {
    const body = record(data);
    const occupationId = body && text(body, "occupationId");
    const scope = body?.scope;
    const expectedCount = body && boundedInt(body.expectedCount, 0, MAX_SERIES);
    if (occupationId == null || (scope !== "data" && scope !== "serie") || expectedCount === null) {
      return reject(400, BAD_REQUEST);
    }
    return fromResult(
      await deps.bookings.cancelOccupation(user, {
        occupationId,
        scope,
        ...(expectedCount === undefined ? {} : { expectedCount }),
      }),
    );
  });
}

/** Datas que o cancelamento da série afetaria (`{ occupationId }`). */
export function previewSeriesAction(deps: BookingDeps, request: RequestLike, data: unknown) {
  return asAccount<{ dates: string[] }>(deps, request, async (user) => {
    const body = record(data);
    const occupationId = body && text(body, "occupationId");
    if (occupationId == null) return reject(400, BAD_REQUEST);
    return fromResult(await deps.bookings.previewSeries(user, occupationId));
  });
}

/** Próximas ocupações do usuário (`{ from?, limit?, offset? }`). */
export function myBookingsAction(deps: BookingDeps, request: RequestLike, data: unknown) {
  return asAccount<{ items: MyBooking[]; hasMore: boolean }>(deps, request, async (user) => {
    const body = data === undefined ? {} : record(data);
    if (body === null) return reject(400, BAD_REQUEST);
    const limit = boundedInt(body.limit, 1, 100);
    const offset = boundedInt(body.offset, 0, MAX_OFFSET);
    const from = body.from;
    if (limit === null || offset === null || (from !== undefined && typeof from !== "string")) {
      return reject(400, BAD_REQUEST);
    }
    return fromResult(
      await deps.bookings.myBookings(user, {
        ...(from === undefined ? {} : { from }),
        ...(limit === undefined ? {} : { limit }),
        ...(offset === undefined ? {} : { offset }),
      }),
    );
  });
}
