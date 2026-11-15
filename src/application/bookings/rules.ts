import type { OccupationRecord } from "#/application/ports";
import { type Failure, fail } from "#/application/validation";
import type { BookingIssue } from "#/domain/availability";
import type { User } from "#/domain/user";

/** Papéis que podem reservar. */
const BOOKING_ROLES = ["admin", "horarios", "docente", "manutencao"] as const;

/** Tamanho máximo da finalidade (título) de uma reserva. */
export const MAX_PURPOSE = 120;
export const DEFAULT_PAGE = 50;
export const MAX_PAGE = 100;
export const SERIES_ON_MANUAL =
  "Esta reserva não faz parte de uma série; cancele apenas esta data.";
export const FORBIDDEN_BOOK = "Sem permissão para reservar.";
export const FORBIDDEN_CANCEL = "Sem permissão para cancelar esta ocupação.";
export const ENDED = "Esta ocupação já terminou e não pode ser cancelada.";
export const ALREADY_CANCELLED = "Esta ocupação já foi cancelada.";
export const SERIES_CHANGED =
  "A série mudou desde a confirmação. Revise as datas e confirme de novo.";
export const SERIES_UPDATE_CHANGED =
  "A série ou a disponibilidade mudou desde a prévia. Revise as alterações antes de confirmar.";
export const RACE_LOST =
  "O horário foi ocupado por outra reserva. Atualize a agenda e escolha outro.";
export const NONE_FREE = "Nenhuma data da série está livre; nada foi reservado.";
export const PREVIEW_CHANGED =
  "As datas livres mudaram desde a prévia; nada foi reservado. Revise a prévia atualizada e confirme de novo.";

export function validationFrom(issue: BookingIssue): Failure {
  return fail("validation", issue.message, issue.field);
}

export function canBook(user: User): boolean {
  return (
    user.active && user.roles.some((role) => (BOOKING_ROLES as readonly string[]).includes(role))
  );
}

/** Criador de avulsa, responsável de importada ou admin. */
export function ownsOccupation(user: User, item: OccupationRecord): boolean {
  if (!user.active) return false;
  if (user.roles.includes("admin")) return true;
  return item.source === "manual" ? item.createdBy === user.id : item.responsibleUserId === user.id;
}

/** Avulsa fora de série recorrente: não há "série" para cancelar. */
export function isLoneManual(item: OccupationRecord): boolean {
  return item.source === "manual" && item.seriesId === null;
}

/** Restrição de posse da série: `null` para admin (série inteira), senão o próprio usuário. */
export function seriesOwner(user: User): string | null {
  return user.roles.includes("admin") ? null : user.id;
}

export function isMine(user: User | null, item: OccupationRecord): boolean {
  return user !== null && (item.createdBy === user.id || item.responsibleUserId === user.id);
}

export function dateOffset(from: string, to: string): number {
  const dayNumber = (date: string) => {
    const [year = "1970", month = "01", day = "01"] = date.split("-");
    return Date.UTC(Number(year), Number(month) - 1, Number(day)) / 86_400_000;
  };
  return dayNumber(to) - dayNumber(from);
}
