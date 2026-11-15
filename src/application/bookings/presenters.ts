import { canBook, isMine, ownsOccupation } from "#/application/bookings/rules";
import type {
  AgendaBlock,
  AgendaItem,
  AgendaPerson,
  DayAgenda,
  MyBooking,
  People,
} from "#/application/bookings/types";
import type { OccupationRecord, OccupationWithSpace } from "#/application/ports";
import { freeIntervals, type Hours } from "#/domain/availability";
import { canAskForRoom, occupationOwnerId, requestIssue } from "#/domain/room-request";
import type { Semester } from "#/domain/semester";
import type { User } from "#/domain/user";

function personOf(item: OccupationRecord, people: People): AgendaPerson | null {
  const id = item.source === "manual" ? item.createdBy : item.responsibleUserId;
  const person = id === null ? undefined : people.get(id);
  return person === undefined
    ? null
    : { name: person.name, code: person.code, placeholder: person.placeholder };
}

/** O visitante logado pode pedir a sala: outra pessoa ocupa, futura e dono com conta ativa. */
function canRequestRoom(
  item: OccupationRecord,
  viewer: User | null,
  nowLocal: string,
  people: People,
): boolean {
  if (viewer === null || !canAskForRoom(viewer)) return false;
  const ownerId = occupationOwnerId(item);
  const owner = ownerId === null ? undefined : people.get(ownerId);
  if (ownerId === null || owner === undefined) return false;
  return (
    requestIssue({
      requesterId: viewer.id,
      occupation: item,
      owner: { id: ownerId, active: owner.active, placeholder: owner.placeholder },
      now: nowLocal,
    }) === null
  );
}

export function toItem(
  item: OccupationRecord,
  viewer: User | null,
  nowLocal: string,
  people: People,
): AgendaItem {
  return {
    id: item.id,
    date: item.startsAt.slice(0, 10),
    start: item.startsAt.slice(11, 16),
    end: item.endsAt.slice(11, 16),
    title: item.title,
    source: item.source,
    status: "ativa",
    canCancel: viewer !== null && item.endsAt > nowLocal && ownsOccupation(viewer, item),
    mine: isMine(viewer, item),
    person: viewer === null ? null : personOf(item, people),
    canRequest: canRequestRoom(item, viewer, nowLocal, people),
  };
}

export const byTitle = new Intl.Collator("pt-BR");

/** Semestre que cobre a data; sem cobertura, o mais recente (a lista já vem do mais novo). */
export function semesterFor(date: string, semesters: readonly Semester[]): Semester | undefined {
  return (
    semesters.find((semester) => semester.start <= date && date <= semester.end) ?? semesters[0]
  );
}

/**
 * "Minhas" são os títulos em que `userId` é o responsável. O mesmo título não se repete em "todas".
 * Os dois grupos ficam em ordem alfabética pt-BR (sem ordem numérica: "aula 10" antes de "aula 2").
 */
export function splitTitles(
  pairs: readonly { title: string; responsibleUserId: string | null }[],
  userId: string,
): { mine: string[]; all: string[] } {
  const mine = new Set<string>();
  const rest = new Set<string>();
  for (const pair of pairs) {
    if (pair.responsibleUserId === userId) mine.add(pair.title);
    else rest.add(pair.title);
  }
  for (const title of mine) rest.delete(title);
  const sort = (values: Set<string>) => [...values].sort((a, b) => byTitle.compare(a, b));
  return { mine: sort(mine), all: sort(rest) };
}

/** Blocos do semestre que cobre a data; sem cobertura, os do semestre mais recente; sem semestre, nenhum. */
export function blocksFor(date: string, semesters: readonly Semester[]): AgendaBlock[] {
  const chosen = semesterFor(date, semesters);
  return (chosen?.blocks ?? []).map((block) => ({
    label: block.name,
    short: block.short,
    start: block.start,
    end: block.end,
  }));
}

/** Ordem natural de nomes: "A-202" antes de "A-1000". */
export const byNaturalName = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" });

export function buildDay(
  spaceId: string,
  date: string,
  now: string,
  hours: Hours,
  items: readonly AgendaItem[],
  semesters: readonly Semester[],
): DayAgenda {
  return {
    spaceId,
    date,
    now,
    hours,
    occupations: [...items],
    free: freeIntervals(hours, items),
    blocks: blocksFor(date, semesters),
  };
}

export function toMyBooking(
  row: OccupationWithSpace,
  user: User,
  now: string,
  people: People,
): MyBooking {
  return {
    ...toItem(row, user, now, people),
    spaceId: row.spaceId,
    spaceName: row.spaceName,
    inSeries: row.seriesId !== null,
    seriesId: row.seriesId,
    responsible: row.source === "import" && row.responsibleUserId === user.id,
    canEdit:
      canBook(user) && row.source === "manual" && row.createdBy === user.id && row.startsAt > now,
  };
}
