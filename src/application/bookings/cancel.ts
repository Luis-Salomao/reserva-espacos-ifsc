import type { BookingsContext } from "#/application/bookings/context";
import {
  ALREADY_CANCELLED,
  ENDED,
  FORBIDDEN_CANCEL,
  isLoneManual,
  ownsOccupation,
  SERIES_CHANGED,
  SERIES_ON_MANUAL,
  seriesOwner,
} from "#/application/bookings/rules";
import type { CancelScope } from "#/application/bookings/types";
import type { NewNotification, OccupationRecord } from "#/application/ports";
import { fail, ok, parseText, type Result } from "#/application/validation";
import { CANCEL_REASONS } from "#/domain/cancel-reasons";
import { MAX_NOTE, occupationOwnerId } from "#/domain/room-request";
import type { User } from "#/domain/user";

/** Cancelamento de ocupações e de séries, com o aviso ao dono. */
export function cancelOperations(ctx: BookingsContext) {
  const { occupations, users, clock, nowLocal, spaceName } = ctx;

  /** Motivo opcional enviado ao dono: aparado, vazio vira `null`. */
  function parseNote(raw: string | undefined): Result<string | null> {
    if (raw === undefined || raw.trim() === "") return ok(null);
    return parseText(raw, MAX_NOTE, "O motivo", "note");
  }

  /**
   * Aviso ao dono quando outra pessoa (a administração) cancela a reserva dele; `null` se quem
   * cancela é o dono, ou se o dono não existe, está inativo ou é conta fantasma.
   */
  async function cancelNotice(
    actor: User,
    item: OccupationRecord,
    at: string,
    note: string | null,
    count: number,
  ): Promise<NewNotification | null> {
    const ownerId = occupationOwnerId(item);
    if (ownerId === null || ownerId === actor.id) return null;
    const owner = await users.findById(ownerId);
    if (owner === null || !owner.active || owner.placeholder) return null;
    const name = await spaceName(item.spaceId);
    return {
      id: crypto.randomUUID(),
      userId: ownerId,
      kind: "reserva_cancelada",
      actorId: actor.id,
      occupationId: item.id,
      requestId: null,
      data: {
        spaceName: name ?? "",
        date: item.startsAt.slice(0, 10),
        start: item.startsAt.slice(11, 16),
        end: item.endsAt.slice(11, 16),
        title: item.title,
        ...(count > 1 ? { count } : {}),
        ...(note === null ? {} : { note }),
      },
      createdAt: at,
    };
  }

  /** Âncora autorizada para cancelar (ou ver a série): existe, está ativa e é do usuário (ou admin). */
  async function loadCancellable(
    user: User,
    occupationId: string,
  ): Promise<Result<OccupationRecord>> {
    const anchor = await occupations.findById(occupationId);
    if (anchor === null) return fail("not_found", "Ocupação não encontrada.");
    if (!ownsOccupation(user, anchor)) return fail("forbidden", FORBIDDEN_CANCEL);
    if (anchor.status !== "ativa") return fail("conflict", ALREADY_CANCELLED);
    if (anchor.endsAt <= nowLocal()) return fail("validation", ENDED);
    return ok(anchor);
  }

  return {
    /**
     * Cancela uma data ou a série. Na importada: mesma aula (`lesson_id`), lote, espaço, dia da
     * semana e horário, de agora em diante (corte: hora de parede atual; a âncora sempre entra). Na
     * avulsa recorrente: a âncora e as próximas da mesma série. O admin cancela a série inteira; os
     * demais, só as linhas em que SÃO o responsável (uma nova versão pode ter trocado o responsável
     * de algumas datas). Em avulsa fora de série a série é recusada. Com `expectedCount` (o tamanho mostrado na prévia), uma série recalculada
     * de outro tamanho não é cancelada (conflito).
     */
    async cancelOccupation(
      user: User,
      input: { occupationId: string; scope: CancelScope; expectedCount?: number; note?: string },
    ): Promise<Result<{ cancelled: number }>> {
      const anchor = await loadCancellable(user, input.occupationId);
      if (!anchor.ok) return anchor;
      const note = parseNote(input.note);
      if (!note.ok) return note;
      const at = clock.now().toISOString();
      const byOwner = occupationOwnerId(anchor.value) === user.id;
      const reason = byOwner ? CANCEL_REASONS.usuario : CANCEL_REASONS.administracao;
      if (input.scope === "serie") {
        if (isLoneManual(anchor.value)) return fail("validation", SERIES_ON_MANUAL);
        const from = nowLocal();
        const owner = seriesOwner(user);
        const current = await occupations.seriesDates(anchor.value, from, owner);
        if (input.expectedCount !== undefined && current.length !== input.expectedCount) {
          return fail("conflict", SERIES_CHANGED);
        }
        const notice = await cancelNotice(user, anchor.value, at, note.value, current.length);
        const cancelled = await occupations.cancelSeries(
          anchor.value,
          from,
          owner,
          reason,
          at,
          notice,
        );
        return ok({ cancelled });
      }
      const notice = await cancelNotice(user, anchor.value, at, note.value, 1);
      const cancelled = await occupations.cancelOne(anchor.value.id, reason, at, notice);
      return cancelled ? ok({ cancelled: 1 }) : fail("conflict", ALREADY_CANCELLED);
    },

    /** Datas que o cancelamento de série afetaria (para a confirmação), pela mesma regra. */
    async previewSeries(user: User, occupationId: string): Promise<Result<{ dates: string[] }>> {
      const anchor = await loadCancellable(user, occupationId);
      if (!anchor.ok) return anchor;
      if (isLoneManual(anchor.value)) return fail("validation", SERIES_ON_MANUAL);
      return ok({
        dates: await occupations.seriesDates(anchor.value, nowLocal(), seriesOwner(user)),
      });
    },
  };
}
