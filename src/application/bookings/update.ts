import type { BookingsContext } from "#/application/bookings/context";
import {
  ALREADY_CANCELLED,
  canBook,
  dateOffset,
  MAX_PURPOSE,
  SERIES_CHANGED,
  SERIES_UPDATE_CHANGED,
  validationFrom,
} from "#/application/bookings/rules";
import type {
  BookingResult,
  SeriesUpdateInput,
  SeriesUpdatePreview,
} from "#/application/bookings/types";
import type { ManualSeriesSlotUpdate } from "#/application/ports";
import { fail, ok, parseText, type Result } from "#/application/validation";
import { validateBookingWhen } from "#/domain/availability";
import { addDays } from "#/domain/calendar";
import { MAX_OCCURRENCES } from "#/domain/recurrence";
import type { User } from "#/domain/user";

async function seriesRevision(
  rows: readonly ManualSeriesSlotUpdate[],
  input: SeriesUpdateInput,
): Promise<string> {
  const bytes = new TextEncoder().encode(
    JSON.stringify({
      rows,
      occupationId: input.occupationId,
      scope: input.scope,
      spaceId: input.spaceId,
      date: input.date,
      start: input.start,
      end: input.end,
      purpose: input.purpose,
    }),
  );
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...digest].map((value) => value.toString(16).padStart(2, "0")).join("");
}

/** Edição de reservas avulsas e de séries avulsas futuras. */
export function updateOperations(ctx: BookingsContext) {
  const { occupations, hours, nowLocal, spaceName } = ctx;

  async function planSeriesUpdate(
    user: User,
    input: SeriesUpdateInput,
  ): Promise<
    Result<{
      seriesId: string;
      anchorStartsAt: string;
      expected: ManualSeriesSlotUpdate[];
      updates: ManualSeriesSlotUpdate[];
      preview: SeriesUpdatePreview;
    }>
  > {
    if (!canBook(user)) return fail("forbidden", "Sem permissão para editar esta reserva.");
    const anchor = await occupations.findById(input.occupationId);
    if (anchor === null) return fail("not_found", "Reserva não encontrada.");
    if (anchor.source !== "manual" || anchor.createdBy !== user.id || anchor.seriesId === null) {
      return fail("forbidden", "Sem permissão para editar esta série.");
    }
    const now = nowLocal();
    if (anchor.status !== "ativa") return fail("conflict", ALREADY_CANCELLED);
    if (anchor.startsAt <= now) {
      return fail("validation", "Escolha uma ocorrência futura da série.", "occupationId");
    }

    const purpose = parseText(input.purpose, MAX_PURPOSE, "A finalidade", "purpose");
    if (!purpose.ok) return purpose;
    if ((await spaceName(input.spaceId)) === null) {
      return fail("not_found", "Espaço não encontrado.", "spaceId");
    }

    const allFuture = await occupations.listManualSeriesForUpdate(anchor.seriesId, user.id, now);
    const rows =
      input.scope === "future"
        ? allFuture.filter((item) => item.startsAt >= anchor.startsAt)
        : allFuture;
    if (rows.length === 0 || !rows.some((item) => item.id === anchor.id)) {
      return fail("conflict", SERIES_CHANGED);
    }

    const offset = dateOffset(anchor.startsAt.slice(0, 10), input.date);
    const expected = rows.map(({ id, spaceId, startsAt, endsAt, title }) => ({
      id,
      spaceId,
      startsAt,
      endsAt,
      title,
    }));
    const updates = rows.map((item): ManualSeriesSlotUpdate => {
      const date = addDays(item.startsAt.slice(0, 10), offset);
      return {
        id: item.id,
        spaceId: input.spaceId,
        startsAt: `${date}T${input.start}`,
        endsAt: `${date}T${input.end}`,
        title: purpose.value,
      };
    });

    for (const update of updates) {
      const issue = validateBookingWhen(
        {
          date: update.startsAt.slice(0, 10),
          start: update.startsAt.slice(11, 16),
          end: update.endsAt.slice(11, 16),
        },
        hours,
        now,
      );
      if (issue !== null) return validationFrom(issue);
    }

    const targetIds = new Set(updates.map((item) => item.id));
    for (let left = 0; left < updates.length; left++) {
      const current = updates[left];
      if (current === undefined) continue;
      for (let right = left + 1; right < updates.length; right++) {
        const other = updates[right];
        if (
          other !== undefined &&
          current.spaceId === other.spaceId &&
          current.startsAt < other.endsAt &&
          current.endsAt > other.startsAt
        ) {
          return fail("conflict", "As novas datas da série se sobrepõem entre si.");
        }
      }
    }

    const firstDate = updates[0]?.startsAt.slice(0, 10);
    const lastDate = updates.at(-1)?.startsAt.slice(0, 10);
    if (firstDate === undefined || lastDate === undefined) {
      return fail("conflict", SERIES_CHANGED);
    }
    const existing = await occupations.listActiveInRangeAll(
      `${firstDate}T00:00`,
      `${addDays(lastDate, 1)}T00:00`,
    );
    for (const update of updates) {
      const conflict = existing.find(
        (item) =>
          !targetIds.has(item.id) &&
          item.spaceId === update.spaceId &&
          item.startsAt < update.endsAt &&
          item.endsAt > update.startsAt,
      );
      if (conflict !== undefined) {
        return fail(
          "conflict",
          `Há conflito em ${update.startsAt.slice(0, 10)} (${conflict.startsAt.slice(11, 16)}–${conflict.endsAt.slice(11, 16)}).`,
        );
      }
    }

    return ok({
      seriesId: anchor.seriesId,
      anchorStartsAt: anchor.startsAt,
      expected,
      updates,
      preview: {
        scope: input.scope,
        count: updates.length,
        revision: await seriesRevision(expected, input),
        changes: rows.map((item, index) => ({
          from: item.startsAt.slice(0, 10),
          to: updates[index]?.startsAt.slice(0, 10) ?? item.startsAt.slice(0, 10),
        })),
      },
    });
  }

  return {
    /** Altera uma ocorrência manual própria sem recriar sua identidade ou alterar a série. */
    async updateBooking(
      user: User,
      input: {
        occupationId: string;
        spaceId: string;
        date: string;
        start: string;
        end: string;
        purpose: string;
      },
    ): Promise<BookingResult> {
      if (!canBook(user)) return fail("forbidden", "Sem permissão para editar esta reserva.");
      const item = await occupations.findById(input.occupationId);
      if (item === null) return fail("not_found", "Reserva não encontrada.");
      if (item.source !== "manual" || item.createdBy !== user.id) {
        return fail("forbidden", "Sem permissão para editar esta reserva.");
      }
      if (item.status !== "ativa") return fail("conflict", ALREADY_CANCELLED);
      const now = nowLocal();
      if (item.startsAt <= now)
        return fail("validation", "Esta reserva já começou e não pode ser editada.");
      const purpose = parseText(input.purpose, MAX_PURPOSE, "A finalidade", "purpose");
      if (!purpose.ok) return purpose;
      const issue = validateBookingWhen(input, hours, now);
      if (issue !== null) return validationFrom(issue);
      if ((await spaceName(input.spaceId)) === null)
        return fail("not_found", "Espaço não encontrado.", "spaceId");
      const updated = await occupations.updateManualIfFree({
        id: item.id,
        createdBy: user.id,
        nowLocal: nowLocal(),
        spaceId: input.spaceId,
        startsAt: `${input.date}T${input.start}`,
        endsAt: `${input.date}T${input.end}`,
        title: purpose.value,
      });
      if (!updated)
        return fail(
          "conflict",
          "A reserva mudou ou o horário foi ocupado. Atualize a agenda e tente novamente.",
        );
      return ok({
        id: item.id,
        spaceId: input.spaceId,
        date: input.date,
        start: input.start,
        end: input.end,
        title: purpose.value,
      });
    },

    /** Prévia das datas afetadas pela edição de uma série manual. */
    async previewSeriesUpdate(
      user: User,
      input: SeriesUpdateInput,
    ): Promise<Result<SeriesUpdatePreview>> {
      const plan = await planSeriesUpdate(user, input);
      return plan.ok ? ok(plan.value.preview) : plan;
    },

    /**
     * Atualiza as ocorrências futuras materializadas. A nova data desloca as demais pelo mesmo
     * número de dias; a relação entre datas é preservada e exceções canceladas permanecem intactas.
     */
    async updateSeriesBooking(
      user: User,
      input: SeriesUpdateInput & { expectedCount: number; expectedRevision: string },
    ): Promise<Result<{ updated: number; dates: string[] }>> {
      if (
        !Number.isInteger(input.expectedCount) ||
        input.expectedCount < 1 ||
        input.expectedCount > MAX_OCCURRENCES ||
        !/^[a-f0-9]{64}$/.test(input.expectedRevision)
      ) {
        return fail("validation", "Revise a prévia da série antes de confirmar.");
      }
      const plan = await planSeriesUpdate(user, input);
      if (!plan.ok) return plan;
      if (
        plan.value.preview.count !== input.expectedCount ||
        plan.value.preview.revision !== input.expectedRevision
      ) {
        return fail("conflict", SERIES_CHANGED);
      }
      const updated = await occupations.updateManualSeriesIfFree({
        seriesId: plan.value.seriesId,
        createdBy: user.id,
        nowLocal: nowLocal(),
        scope: input.scope,
        anchorStartsAt: plan.value.anchorStartsAt,
        expected: plan.value.expected,
        updates: plan.value.updates,
      });
      if (!updated) return fail("conflict", SERIES_UPDATE_CHANGED);
      return ok({
        updated: plan.value.preview.count,
        dates: plan.value.preview.changes.map((change) => change.to),
      });
    },
  };
}
