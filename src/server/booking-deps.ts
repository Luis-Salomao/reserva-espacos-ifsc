import { createBookingsService } from "#/application/bookings";
import { createOccupationRepository } from "#/infra/db/repos/occupation-repository";
import { createSemesterRepository } from "#/infra/db/repos/semester-repository";
import { createSpaceRepository } from "#/infra/db/repos/space-repository";
import { getEnv } from "#/infra/env";
import { systemClock } from "#/infra/runtime";
import { getDb, getRuntimeEnv } from "#db-client";
import { getAuth } from "./auth-context.ts";
import type { BookingDeps } from "./booking-actions.ts";

/** Raiz de composição da agenda e das reservas (só no servidor, montada por requisição). */
export function getBookingDeps(): BookingDeps {
  const env = getEnv(getRuntimeEnv());
  const db = getDb();
  return {
    auth: getAuth(),
    cookieSecure: env.COOKIE_SECURE,
    publicRead: env.PUBLIC_READ,
    bookings: createBookingsService({
      occupations: createOccupationRepository(db),
      spaces: createSpaceRepository(db),
      semesters: createSemesterRepository(db),
      clock: systemClock,
      timeZone: env.TIMEZONE,
      hours: { opens: env.AGENDA_OPENS_AT, closes: env.AGENDA_CLOSES_AT },
    }),
  };
}
