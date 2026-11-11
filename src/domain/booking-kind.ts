/** Prefixo que marca uma reserva como manutenção no título/finalidade. */
export const MAINTENANCE_PREFIX = "Manutenção: ";

/** Tipo de reserva escolhido no formulário. */
export type BookingKind = "evento" | "manutencao";

/** `true` se o título carrega o prefixo de manutenção. */
export function isMaintenanceTitle(title: string): boolean {
  return title.startsWith(MAINTENANCE_PREFIX);
}

/**
 * Monta o título final da reserva: prefixa só quando `kind` é "manutencao". O texto é cortado
 * nas pontas antes de compor, para o resultado não ter espaços sobrando entre o prefixo e o texto.
 */
export function buildBookingTitle(kind: BookingKind, text: string): string {
  const trimmed = text.trim();
  return kind === "manutencao" ? `${MAINTENANCE_PREFIX}${trimmed}` : trimmed;
}
