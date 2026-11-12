import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import {
  cancelOccupationAction,
  createBookingAction,
  createRecurringAction,
  getDayAgenda,
  getRoomsDay,
  getRoomsWeek,
  getSubjects,
  getWeekAgenda,
  myBookingsAction,
  previewRecurringAction,
  previewSeriesAction,
  previewSeriesUpdateAction,
  updateBookingAction,
  updateSeriesBookingAction,
} from "./booking-actions.ts";
import { getBookingDeps } from "./booking-deps.ts";
import { finish } from "./finish.ts";
import { passthrough } from "./input.ts";

export const updateBookingFn = createServerFn({ method: "POST" })
  .validator(passthrough)
  .handler(async ({ data }) =>
    finish(await updateBookingAction(getBookingDeps(), getRequest(), data)),
  );
export const previewSeriesUpdateFn = createServerFn({ method: "POST" })
  .validator(passthrough)
  .handler(async ({ data }) =>
    finish(await previewSeriesUpdateAction(getBookingDeps(), getRequest(), data)),
  );
export const updateSeriesBookingFn = createServerFn({ method: "POST" })
  .validator(passthrough)
  .handler(async ({ data }) =>
    finish(await updateSeriesBookingAction(getBookingDeps(), getRequest(), data)),
  );
export const getSubjectsFn = createServerFn({ method: "POST" })
  .validator(passthrough)
  .handler(async ({ data }) => finish(await getSubjects(getBookingDeps(), getRequest(), data)));

export const getDayAgendaFn = createServerFn({ method: "POST" })
  .validator(passthrough)
  .handler(async ({ data }) => finish(await getDayAgenda(getBookingDeps(), getRequest(), data)));

export const getWeekAgendaFn = createServerFn({ method: "POST" })
  .validator(passthrough)
  .handler(async ({ data }) => finish(await getWeekAgenda(getBookingDeps(), getRequest(), data)));

export const getRoomsDayFn = createServerFn({ method: "POST" })
  .validator(passthrough)
  .handler(async ({ data }) => finish(await getRoomsDay(getBookingDeps(), getRequest(), data)));

export const getRoomsWeekFn = createServerFn({ method: "POST" })
  .validator(passthrough)
  .handler(async ({ data }) => finish(await getRoomsWeek(getBookingDeps(), getRequest(), data)));

export const createBookingFn = createServerFn({ method: "POST" })
  .validator(passthrough)
  .handler(async ({ data }) =>
    finish(await createBookingAction(getBookingDeps(), getRequest(), data)),
  );

export const previewRecurringFn = createServerFn({ method: "POST" })
  .validator(passthrough)
  .handler(async ({ data }) =>
    finish(await previewRecurringAction(getBookingDeps(), getRequest(), data)),
  );

export const createRecurringFn = createServerFn({ method: "POST" })
  .validator(passthrough)
  .handler(async ({ data }) =>
    finish(await createRecurringAction(getBookingDeps(), getRequest(), data)),
  );

export const cancelOccupationFn = createServerFn({ method: "POST" })
  .validator(passthrough)
  .handler(async ({ data }) =>
    finish(await cancelOccupationAction(getBookingDeps(), getRequest(), data)),
  );

export const previewSeriesFn = createServerFn({ method: "POST" })
  .validator(passthrough)
  .handler(async ({ data }) =>
    finish(await previewSeriesAction(getBookingDeps(), getRequest(), data)),
  );

export const myBookingsFn = createServerFn({ method: "POST" })
  .validator(passthrough)
  .handler(async ({ data }) =>
    finish(await myBookingsAction(getBookingDeps(), getRequest(), data)),
  );
