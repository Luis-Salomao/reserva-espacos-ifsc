import { createNoticesService } from "#/application/notifications";
import { createNotificationRepository } from "#/infra/db/repos/notification-repository";
import { createRoomRequestRepository } from "#/infra/db/repos/room-request-repository";
import { getEnv } from "#/infra/env";
import { systemClock } from "#/infra/runtime";
import { getDb, getRuntimeEnv } from "#db-client";

/** Serviço de avisos montado por requisição, sobre o banco e o relógio do ambiente. */
export function getNoticesService() {
  const env = getEnv(getRuntimeEnv());
  const db = getDb();
  return createNoticesService({
    notifications: createNotificationRepository(db),
    requests: createRoomRequestRepository(db),
    clock: systemClock,
    timeZone: env.TIMEZONE,
  });
}
