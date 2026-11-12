import type { NoticesOverview, NoticesService } from "#/application/notifications";
import type { RoomRequestsService } from "#/application/room-requests";
import {
  type AdminResponse,
  BAD_REQUEST,
  fromResult,
  type RequestLike,
  record,
  reject,
  text,
} from "./admin-actions.ts";
import type { AuthPort } from "./auth-handlers.ts";
import { asAccount } from "./booking-actions.ts";
import type { CookieSecureMode } from "./session.ts";

export type NoticeDeps = {
  auth: AuthPort;
  notices: NoticesService;
  requests: RoomRequestsService;
  cookieSecure: CookieSecureMode;
};

type Empty = Record<string, never>;

/** Avisos, pedidos recebidos e pedidos enviados de quem está logado. */
export function myNoticesAction(deps: NoticeDeps, request: RequestLike, _data: unknown) {
  return asAccount<NoticesOverview>(deps, request, async (user) =>
    fromResult(await deps.notices.overview(user)),
  );
}

/** Marca como lidos todos os avisos de quem está logado. */
export function markNoticesReadAction(deps: NoticeDeps, request: RequestLike, _data: unknown) {
  return asAccount<Empty>(deps, request, async (user) =>
    fromResult(await deps.notices.markRead(user)),
  );
}

type Handler<T> = (
  user: Parameters<NoticesService["markRead"]>[0],
  body: Record<string, unknown>,
) => Promise<AdminResponse<T>>;

/** Corpo JSON obrigatório; as regras de posse ficam no serviço (403/404/409 ali). */
function withBody<T>(deps: NoticeDeps, request: RequestLike, data: unknown, run: Handler<T>) {
  return asAccount<T>(deps, request, async (user) => {
    const body = record(data);
    if (body === null) return reject(400, BAD_REQUEST);
    return run(user, body);
  });
}

/** Pede a sala de uma ocupação (`{ occupationId, purpose, message? }`). */
export function requestRoomAction(deps: NoticeDeps, request: RequestLike, data: unknown) {
  return withBody<{ id: string }>(deps, request, data, async (user, body) => {
    const occupationId = text(body, "occupationId");
    const purpose = text(body, "purpose");
    const message = body.message;
    if (
      occupationId === null ||
      purpose === null ||
      (message !== undefined && typeof message !== "string")
    ) {
      return reject(400, BAD_REQUEST);
    }
    return fromResult(
      await deps.requests.request(user, {
        occupationId,
        purpose,
        ...(message === undefined ? {} : { message }),
      }),
    );
  });
}

/** O dono aceita o pedido (`{ requestId }`). */
export function acceptRequestAction(deps: NoticeDeps, request: RequestLike, data: unknown) {
  return withBody<{ occupationId: string }>(deps, request, data, async (user, body) => {
    const requestId = text(body, "requestId");
    if (requestId === null) return reject(400, BAD_REQUEST);
    return fromResult(await deps.requests.accept(user, requestId));
  });
}

/** O dono recusa o pedido (`{ requestId, note? }`). */
export function declineRequestAction(deps: NoticeDeps, request: RequestLike, data: unknown) {
  return withBody<Empty>(deps, request, data, async (user, body) => {
    const requestId = text(body, "requestId");
    const note = body.note;
    if (requestId === null || (note !== undefined && typeof note !== "string")) {
      return reject(400, BAD_REQUEST);
    }
    return fromResult(
      await deps.requests.decline(user, { requestId, ...(note === undefined ? {} : { note }) }),
    );
  });
}

/** Quem pediu desiste do pedido pendente (`{ requestId }`). */
export function withdrawRequestAction(deps: NoticeDeps, request: RequestLike, data: unknown) {
  return withBody<Empty>(deps, request, data, async (user, body) => {
    const requestId = text(body, "requestId");
    if (requestId === null) return reject(400, BAD_REQUEST);
    return fromResult(await deps.requests.withdraw(user, requestId));
  });
}
