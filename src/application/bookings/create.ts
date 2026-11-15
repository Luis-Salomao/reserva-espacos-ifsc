import type { BookingsContext } from "#/application/bookings/context";
import {
  canBook,
  FORBIDDEN_BOOK,
  MAX_PURPOSE,
  NONE_FREE,
  PREVIEW_CHANGED,
  RACE_LOST,
  validationFrom,
} from "#/application/bookings/rules";
import type {
  BookingResult,
  ConflictInfo,
  RecurringDate,
  RecurringInput,
  RecurringOutcome,
  RecurringPreview,
} from "#/application/bookings/types";
import { fail, ok, parseText, type Result } from "#/application/validation";
import { validateBookingWhen } from "#/domain/availability";
import { addDays } from "#/domain/calendar";
import { expandRecurrence, recurrenceSummary } from "#/domain/recurrence";
import type { User } from "#/domain/user";

/** Criação de reservas avulsas e de séries recorrentes. */
export function createOperations(ctx: BookingsContext) {
  const { occupations, clock, hours, nowLocal, spaceName } = ctx;

  /**
   * Valida a série como a reserva simples (papel, finalidade, data inicial, horário, espaço) e a
   * sobreposição de cada data, com uma única consulta de ocupações. As demais datas vêm depois da
   * inicial, com o mesmo horário: se a inicial passa no expediente e no "sem passado", todas passam.
   */
  async function planRecurring(
    user: User,
    input: RecurringInput,
  ): Promise<Result<{ title: string; preview: RecurringPreview }>> {
    if (!canBook(user)) return fail("forbidden", FORBIDDEN_BOOK);
    const purpose = parseText(input.purpose, MAX_PURPOSE, "A finalidade", "purpose");
    if (!purpose.ok) return purpose;
    const issue = validateBookingWhen(input, hours, nowLocal());
    if (issue !== null) return validationFrom(issue);
    if ((await spaceName(input.spaceId)) === null) {
      return fail("not_found", "Espaço não encontrado.", "spaceId");
    }
    const expansion = expandRecurrence(input.date, input.rule);
    if (!expansion.ok) return fail("validation", expansion.message, "repeat");
    const { dates } = expansion;
    const busy = await occupations.listActiveInRange(
      input.spaceId,
      `${dates[0] ?? input.date}T00:00`,
      `${addDays(dates.at(-1) ?? input.date, 1)}T00:00`,
    );
    const statuses = dates.map((date): RecurringDate => {
      const startsAt = `${date}T${input.start}`;
      const endsAt = `${date}T${input.end}`;
      const blocking = busy.filter((item) => item.startsAt < endsAt && item.endsAt > startsAt);
      if (blocking.length === 0) return { date, free: true };
      const reason = blocking
        .map((item) => `${item.title}, ${item.startsAt.slice(11, 16)}–${item.endsAt.slice(11, 16)}`)
        .join("; ");
      return { date, free: false, reason };
    });
    return ok({
      title: purpose.value,
      preview: { summary: recurrenceSummary(input.date, input.rule, dates), dates: statuses },
    });
  }

  return {
    /**
     * Reserva avulsa. A gravação é uma única instrução condicional (nenhuma ocupação ativa
     * sobreposta), então de duas reservas concorrentes conflitantes só uma é confirmada.
     */
    async createBooking(
      user: User,
      input: { spaceId: string; date: string; start: string; end: string; purpose: string },
    ): Promise<BookingResult> {
      if (!canBook(user)) return fail("forbidden", FORBIDDEN_BOOK);
      const purpose = parseText(input.purpose, MAX_PURPOSE, "A finalidade", "purpose");
      if (!purpose.ok) return purpose;
      const issue = validateBookingWhen(input, hours, nowLocal());
      if (issue !== null) return validationFrom(issue);
      const name = await spaceName(input.spaceId);
      if (name === null) return fail("not_found", "Espaço não encontrado.", "spaceId");

      const id = crypto.randomUUID();
      const startsAt = `${input.date}T${input.start}`;
      const endsAt = `${input.date}T${input.end}`;
      const result = await occupations.insertManualIfFree({
        id,
        spaceId: input.spaceId,
        startsAt,
        endsAt,
        title: purpose.value,
        createdBy: user.id,
        createdAt: clock.now().toISOString(),
      });
      if (result.inserted) {
        return ok({
          id,
          spaceId: input.spaceId,
          date: input.date,
          start: input.start,
          end: input.end,
          title: purpose.value,
        });
      }
      if (result.blocking === null) return fail("conflict", RACE_LOST);
      const conflict: ConflictInfo = {
        title: result.blocking.title,
        spaceName: name,
        date: result.blocking.startsAt.slice(0, 10),
        start: result.blocking.startsAt.slice(11, 16),
        end: result.blocking.endsAt.slice(11, 16),
      };
      return {
        ...fail(
          "conflict",
          `Conflita com ${conflict.title} — ${conflict.spaceName}, ${conflict.start}–${conflict.end}.`,
        ),
        conflict,
      };
    },

    /** Prévia da série: datas livres e com conflito, sem gravar nada. */
    async previewRecurring(user: User, input: RecurringInput): Promise<Result<RecurringPreview>> {
      const plan = await planRecurring(user, input);
      return plan.ok ? ok(plan.value.preview) : plan;
    },

    /**
     * Grava o subconjunto escolhido de datas da regra numa unidade atômica. Conflito em qualquer
     * data escolhida (inclusive uma corrida na gravação) impede toda a seleção e atualiza a prévia.
     */
    async createRecurring(
      user: User,
      input: RecurringInput & { confirmed: readonly string[] },
    ): Promise<Result<RecurringOutcome>> {
      const plan = await planRecurring(user, input);
      if (!plan.ok) return plan;
      const { title, preview } = plan.value;
      const confirmed = new Set(input.confirmed);
      const offered = new Set(preview.dates.map((item) => item.date));
      if (
        confirmed.size === 0 ||
        confirmed.size !== input.confirmed.length ||
        input.confirmed.some((date) => !offered.has(date))
      ) {
        return fail(
          "validation",
          "Escolha ao menos uma data da série, sem repetir datas.",
          "confirmed",
        );
      }
      const selected = preview.dates.filter((item) => confirmed.has(item.date));
      if (!preview.dates.some((item) => item.free))
        return ok({ created: false, message: NONE_FREE, preview });
      if (selected.some((item) => !item.free)) {
        return ok({ created: false, message: PREVIEW_CHANGED, preview });
      }
      const dates = selected.map((item) => item.date);
      const seriesId = crypto.randomUUID();
      const inserted = await occupations.insertSeriesIfFree({
        seriesId,
        spaceId: input.spaceId,
        title,
        createdBy: user.id,
        createdAt: clock.now().toISOString(),
        slots: dates.map((date) => ({
          id: crypto.randomUUID(),
          startsAt: `${date}T${input.start}`,
          endsAt: `${date}T${input.end}`,
        })),
      });
      if (!inserted) {
        const again = await planRecurring(user, input);
        return ok({
          created: false,
          message: PREVIEW_CHANGED,
          preview: again.ok ? again.value.preview : preview,
        });
      }
      return ok({
        created: true,
        seriesId,
        dates,
        skipped: preview.dates.filter((item) => !item.free),
      });
    },
  };
}
