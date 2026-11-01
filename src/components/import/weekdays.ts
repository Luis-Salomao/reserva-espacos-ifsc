const WEEKDAY_NAMES = [
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
  "Domingo",
] as const;

export function weekdayName(weekday: number): string {
  return WEEKDAY_NAMES[weekday] ?? `Dia ${weekday + 1}`;
}

export const SLOT_STATUS_LABEL = {
  applicable: "Importado",
  no_room: "Sem sala",
  multiple_rooms: "Várias salas",
} as const;
