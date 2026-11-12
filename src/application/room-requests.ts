import { MAX_PURPOSE } from "#/application/bookings";
import type {
  Clock,
  NewNotification,
  OccupationRepository,
  RoomRequestRepository,
  RoomRequestRow,
  SpaceRepository,
  UserRepository,
} from "#/application/ports";
import { fail, ok, parseText, type Result } from "#/application/validation";
import { localNow } from "#/domain/availability";
import type { NoticeData } from "#/domain/notification";
import {
  canAskForRoom,
  effectiveStatus,
  MAX_NOTE,
  occupationOwnerId,
  requestIssue,
  UNAVAILABLE,
} from "#/domain/room-request";
import type { User } from "#/domain/user";

const FORBIDDEN_REQUEST = "Sem permissão para pedir salas.";
const DUPLICATE = "Você já tem um pedido pendente para esta sala nesta data.";
const GONE = "Este pedido não está mais disponível.";

export type RoomRequestsDeps = {
  occupations: Pick<OccupationRepository, "findById">;
  users: Pick<UserRepository, "findById">;
  spaces: Pick<SpaceRepository, "list">;
  requests: RoomRequestRepository;
  clock: Clock;
  timeZone: string;
};

/** Texto opcional: vazio vira `null`; senão aparado, até `MAX_NOTE` e sem controle. */
function optionalNote(
  raw: string | undefined,
  label: string,
  field: string,
): Result<string | null> {
  if (raw === undefined || raw.trim() === "") return ok(null);
  return parseText(raw, MAX_NOTE, label, field);
}

function slotOf(row: { spaceName: string; startsAt: string; endsAt: string }) {
  return {
    spaceName: row.spaceName,
    date: row.startsAt.slice(0, 10),
    start: row.startsAt.slice(11, 16),
    end: row.endsAt.slice(11, 16),
  };
}

export function createRoomRequestsService(deps: RoomRequestsDeps) {
  const { occupations, users, spaces, requests, clock, timeZone } = deps;
  const nowLocal = () => localNow(clock.now(), timeZone);

  function notice(
    kind: NewNotification["kind"],
    userId: string,
    actorId: string,
    row: { id: string; occupationId: string },
    data: NoticeData,
    at: string,
  ): NewNotification {
    return {
      id: crypto.randomUUID(),
      userId,
      kind,
      actorId,
      occupationId: row.occupationId,
      requestId: row.id,
      data,
      createdAt: at,
    };
  }

  /** Pedido pendente do dono, ainda disponível; falha com 404, 403 ou 409. */
  async function loadActionable(user: User, requestId: string): Promise<Result<RoomRequestRow>> {
    const row = await requests.findById(requestId);
    if (row === null) return fail("not_found", "Pedido não encontrado.");
    if (row.ownerId !== user.id) {
      return fail("forbidden", "Só quem ocupa a sala responde ao pedido.");
    }
    const status = effectiveStatus(
      row.status,
      { status: row.occupationStatus, endsAt: row.endsAt },
      nowLocal(),
    );
    return status === "pendente" ? ok(row) : fail("conflict", GONE);
  }

  return {
    /** Pede a sala de outra pessoa, numa data e horário; o dono recebe o pedido em Minhas reservas. */
    async request(
      user: User,
      input: { occupationId: string; purpose: string; message?: string },
    ): Promise<Result<{ id: string }>> {
      if (!canAskForRoom(user)) return fail("forbidden", FORBIDDEN_REQUEST);
      const purpose = parseText(input.purpose, MAX_PURPOSE, "A finalidade", "purpose");
      if (!purpose.ok) return purpose;
      const message = optionalNote(input.message, "A mensagem", "message");
      if (!message.ok) return message;
      const occupation = await occupations.findById(input.occupationId);
      if (occupation === null) return fail("not_found", "Ocupação não encontrada.");
      const ownerId = occupationOwnerId(occupation);
      const owner = ownerId === null ? null : await users.findById(ownerId);
      const issue = requestIssue({ requesterId: user.id, occupation, owner, now: nowLocal() });
      if (issue !== null) return fail(issue === UNAVAILABLE ? "conflict" : "validation", issue);
      if (owner === null) return fail("validation", GONE);
      const name = (await spaces.list()).find((space) => space.id === occupation.spaceId)?.name;
      const at = clock.now().toISOString();
      const id = crypto.randomUUID();
      const created = await requests.create({
        id,
        occupationId: occupation.id,
        requesterId: user.id,
        ownerId: owner.id,
        purpose: purpose.value,
        message: message.value,
        createdAt: at,
        notice: notice(
          "pedido_recebido",
          owner.id,
          user.id,
          { id, occupationId: occupation.id },
          {
            ...slotOf({ spaceName: name ?? "", ...occupation }),
            title: purpose.value,
            actorName: user.name,
            ...(message.value === null ? {} : { message: message.value }),
          },
          at,
        ),
      });
      return created ? ok({ id }) : fail("conflict", DUPLICATE);
    },

    /** O dono aceita: a ocupação passa, atomicamente, para quem pediu. */
    async accept(user: User, requestId: string): Promise<Result<{ occupationId: string }>> {
      const found = await loadActionable(user, requestId);
      if (!found.ok) return found;
      const row = found.value;
      const requester = await users.findById(row.requesterId);
      if (requester === null || !requester.active) {
        return fail("conflict", "Quem pediu a sala não tem mais conta ativa.");
      }
      const at = clock.now().toISOString();
      const newOccupationId = crypto.randomUUID();
      const accepted = await requests.accept({
        requestId: row.id,
        ownerId: user.id,
        newOccupationId,
        at,
        nowLocal: nowLocal(),
        notice: notice(
          "pedido_aceito",
          row.requesterId,
          user.id,
          row,
          { ...slotOf(row), title: row.purpose, actorName: user.name },
          at,
        ),
      });
      return accepted ? ok({ occupationId: newOccupationId }) : fail("conflict", GONE);
    },

    /** O dono recusa, com motivo opcional; quem pediu é avisado. */
    async decline(
      user: User,
      input: { requestId: string; note?: string },
    ): Promise<Result<Record<string, never>>> {
      const note = optionalNote(input.note, "O motivo", "note");
      if (!note.ok) return note;
      const found = await loadActionable(user, input.requestId);
      if (!found.ok) return found;
      const row = found.value;
      const at = clock.now().toISOString();
      const declined = await requests.decline({
        requestId: row.id,
        ownerId: user.id,
        note: note.value,
        at,
        notice: notice(
          "pedido_recusado",
          row.requesterId,
          user.id,
          row,
          {
            ...slotOf(row),
            title: row.purpose,
            actorName: user.name,
            ...(note.value === null ? {} : { note: note.value }),
          },
          at,
        ),
      });
      return declined ? ok({}) : fail("conflict", GONE);
    },

    /** Quem pediu desiste de um pedido pendente (sem aviso). */
    async withdraw(user: User, requestId: string): Promise<Result<Record<string, never>>> {
      const row = await requests.findById(requestId);
      if (row === null) return fail("not_found", "Pedido não encontrado.");
      if (row.requesterId !== user.id) return fail("forbidden", "Este pedido não é seu.");
      const withdrawn = await requests.withdraw(row.id, user.id, clock.now().toISOString());
      return withdrawn ? ok({}) : fail("conflict", GONE);
    },
  };
}

export type RoomRequestsService = ReturnType<typeof createRoomRequestsService>;
