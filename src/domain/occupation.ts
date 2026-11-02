type OccupationSource = "import" | "manual";
type OccupationStatus = "ativa" | "cancelada";

/** Ocupação de um espaço; horários locais de parede "YYYY-MM-DDTHH:MM", intervalo `[startsAt, endsAt)`. */
export type Occupation = {
  id: string;
  spaceId: string;
  startsAt: string;
  endsAt: string;
  source: OccupationSource;
  batchId: string | null;
  lessonId: string | null;
  responsibleUserId: string | null;
  title: string;
  status: OccupationStatus;
};

export type LocalDateTime = string;

export function localDateTime(date: string, time: string): LocalDateTime {
  return `${date}T${time}`;
}

/** Intervalos meio-abertos `[início, fim)`: adjacentes não se sobrepõem (comparação lexicográfica). */
export function intervalsOverlap(
  a: { startsAt: string; endsAt: string },
  b: { startsAt: string; endsAt: string },
): boolean {
  return a.startsAt < b.endsAt && b.startsAt < a.endsAt;
}
