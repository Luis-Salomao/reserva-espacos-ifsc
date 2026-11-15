import { cancelOperations } from "#/application/bookings/cancel";
import { createContext } from "#/application/bookings/context";
import { createOperations } from "#/application/bookings/create";
import { mineOperations } from "#/application/bookings/mine";
import { queryOperations } from "#/application/bookings/queries";
import type { BookingsDeps } from "#/application/bookings/types";
import { updateOperations } from "#/application/bookings/update";

export { MAX_PURPOSE } from "#/application/bookings/rules";
export type {
  AgendaItem,
  AgendaPerson,
  BookingsDeps,
  BookingView,
  DayAgenda,
  MyBooking,
  MyDates,
  MySubject,
  MyWeek,
  RecurringOutcome,
  RecurringPreview,
  RoomDay,
  RoomsDay,
  RoomsRange,
  SeriesUpdateInput,
  SeriesUpdatePreview,
  WeekAgenda,
} from "#/application/bookings/types";

/** Serviço de reservas: compõe as operações de consulta, criação, edição e cancelamento. */
export function createBookingsService(deps: BookingsDeps) {
  const ctx = createContext(deps);
  return {
    ...updateOperations(ctx),
    ...queryOperations(ctx),
    ...createOperations(ctx),
    ...cancelOperations(ctx),
    ...mineOperations(ctx),
  };
}

export type BookingsService = ReturnType<typeof createBookingsService>;
