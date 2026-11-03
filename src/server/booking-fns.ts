import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import {
  cancelOccupationAction,
  createBookingAction,
  getDayAgenda,
  getWeekAgenda,
  myBookingsAction,
  previewSeriesAction,
} from "./booking-actions.ts";
import { getBookingDeps } from "./booking-deps.ts";
import { finish } from "./finish.ts";
import { passthrough } from "./input.ts";

export const getDayAgendaFn = createServerFn({ method: "POST" })
  .validator(passthrough)
  .handler(async ({ data }) => finish(await getDayAgenda(getBookingDeps(), getRequest(), data)));

export const getWeekAgendaFn = createServerFn({ method: "POST" })
  .validator(passthrough)
  .handler(async ({ data }) => finish(await getWeekAgenda(getBookingDeps(), getRequest(), data)));

export const createBookingFn = createServerFn({ method: "POST" })
  .validator(passthrough)
  .handler(async ({ data }) =>
    finish(await createBookingAction(getBookingDeps(), getRequest(), data)),
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
