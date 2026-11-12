import { createRoomRequestsService } from "#/application/room-requests";
import { createOccupationRepository } from "#/infra/db/repos/occupation-repository";
import { createRoomRequestRepository } from "#/infra/db/repos/room-request-repository";
import { createSpaceRepository } from "#/infra/db/repos/space-repository";
import { createUserRepository } from "#/infra/db/repos/user-repository";
import { getEnv } from "#/infra/env";
import { systemClock } from "#/infra/runtime";
import { getDb, getRuntimeEnv } from "#db-client";
import { getAuth } from "./auth-context.ts";
import { getNoticesService } from "./notices-context.ts";
import type { NoticeDeps } from "./notification-actions.ts";

/** Raiz de composição dos avisos e pedidos de sala (só no servidor, montada por requisição). */
export function getNoticeDeps(): NoticeDeps {
  const env = getEnv(getRuntimeEnv());
  const db = getDb();
  return {
    auth: getAuth(),
    cookieSecure: env.COOKIE_SECURE,
    notices: getNoticesService(),
    requests: createRoomRequestsService({
      occupations: createOccupationRepository(db),
      users: createUserRepository(db),
      spaces: createSpaceRepository(db),
      requests: createRoomRequestRepository(db),
      clock: systemClock,
      timeZone: env.TIMEZONE,
    }),
  };
}
