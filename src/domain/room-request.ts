/** Situação gravada de um pedido de sala. */
export type RequestStatus = "pendente" | "aceito" | "recusado" | "cancelado" | "encerrado";

/** Situação mostrada: a gravada, ou "indisponivel" quando o pedido pendente perdeu a ocupação. */
export type EffectiveStatus = RequestStatus | "indisponivel";

/** Tamanho máximo da mensagem do pedido e do motivo de uma decisão. */
export const MAX_NOTE = 300;

type OwnedOccupation = {
  source: "import" | "manual";
  createdBy: string | null;
  responsibleUserId: string | null;
};

/**
 * Dono de verdade da ocupação: quem reservou (avulsa) ou o responsável (importada). Diferente de
 * "pode cancelar", o administrador não é dono de tudo.
 */
export function occupationOwnerId(item: OwnedOccupation): string | null {
  return item.source === "manual" ? item.createdBy : item.responsibleUserId;
}

type OccupationState = { status: "ativa" | "cancelada"; endsAt: string };

/** Pedido pendente só vale enquanto a ocupação está ativa e não terminou. */
export function effectiveStatus(
  status: RequestStatus,
  occupation: OccupationState,
  now: string,
): EffectiveStatus {
  if (status !== "pendente") return status;
  return occupation.status === "ativa" && occupation.endsAt > now ? "pendente" : "indisponivel";
}

export const NO_OWNER = "Esta aula não tem responsável com conta ativa; fale com a coordenação.";
export const OWN_OCCUPATION = "Esta ocupação já é sua.";
export const UNAVAILABLE = "Esta ocupação não está mais disponível.";

/**
 * Motivo pelo qual o pedido não pode ser feito, ou `null` se pode. Só olha a ocupação e as
 * pessoas; o papel de quem pede é checado na aplicação.
 */
export function requestIssue(input: {
  requesterId: string;
  occupation: OccupationState & OwnedOccupation;
  owner: { id: string; active: boolean; placeholder: boolean } | null;
  now: string;
}): string | null {
  const { occupation, owner, requesterId, now } = input;
  if (effectiveStatus("pendente", occupation, now) !== "pendente") return UNAVAILABLE;
  if (owner === null || !owner.active || owner.placeholder) return NO_OWNER;
  if (owner.id === requesterId) return OWN_OCCUPATION;
  return null;
}

/** Papéis que pedem salas: têm a página Minhas reservas, onde o pedido é respondido. */
const REQUESTER_ROLES = ["admin", "docente"];

/** Conta ativa com papel que pode pedir a sala de outra pessoa. */
export function canAskForRoom(user: { active: boolean; roles: readonly string[] }): boolean {
  return user.active && user.roles.some((role) => REQUESTER_ROLES.includes(role));
}
