import type { AgendaItem } from "#/application/bookings";

export type PositionedEvent = AgendaItem & {
  startMinutes: number;
  endMinutes: number;
  lane: number;
  lanes: number;
  isConflict: boolean;
};

/** Converte horário no formato "HH:MM" para minutos a partir de 00:00. */
export function timeToMinutes(time: string): number {
  const [hStr = "0", mStr = "0"] = time.split(":");
  const h = Number(hStr);
  const m = Number(mStr);
  return h * 60 + m;
}

/** Formata minutos para o rótulo do eixo horário ("HH:00"). */
export function formatHourAxis(minutes: number): string {
  const h = Math.floor(minutes / 60);
  return `${String(h).padStart(2, "0")}:00`;
}

/**
 * Agrupa eventos concorrentes em faixas paralelas (multi-lane packing)
 * e marca conflitos de horário entre eventos sobrepostos.
 */
export function layoutEvents(items: readonly AgendaItem[]): PositionedEvent[] {
  if (items.length === 0) return [];

  const events: PositionedEvent[] = items
    .map((item) => ({
      ...item,
      startMinutes: timeToMinutes(item.start),
      endMinutes: timeToMinutes(item.end),
      lane: 0,
      lanes: 1,
      isConflict: false,
    }))
    .sort((a, b) => a.startMinutes - b.startMinutes || a.endMinutes - b.endMinutes);

  // Marcação de conflito pairwise
  for (let i = 0; i < events.length; i++) {
    const evI = events[i];
    if (!evI) continue;
    for (let j = i + 1; j < events.length; j++) {
      const evJ = events[j];
      if (!evJ) continue;
      if (evI.startMinutes < evJ.endMinutes && evJ.startMinutes < evI.endMinutes) {
        evI.isConflict = true;
        evJ.isConflict = true;
      }
    }
  }

  // Agrupamento em clusters conexos e empacotamento guloso de faixas
  let cluster: PositionedEvent[] = [];
  let clusterEnd = 0;

  function flushCluster() {
    if (cluster.length === 0) return;
    const laneEnds: number[] = [];
    for (const ev of cluster) {
      let laneIdx = laneEnds.findIndex((end) => end <= ev.startMinutes);
      if (laneIdx < 0) {
        laneIdx = laneEnds.length;
        laneEnds.push(0);
      }
      laneEnds[laneIdx] = ev.endMinutes;
      ev.lane = laneIdx;
    }
    const totalLanes = laneEnds.length;
    for (const ev of cluster) {
      ev.lanes = totalLanes;
    }
    cluster = [];
  }

  for (const ev of events) {
    if (cluster.length > 0 && ev.startMinutes >= clusterEnd) {
      flushCluster();
      clusterEnd = 0;
    }
    cluster.push(ev);
    clusterEnd = Math.max(clusterEnd, ev.endMinutes);
  }
  flushCluster();

  return events;
}

/** Intervalos livres com o que já passou cortado: dia anterior a `now` fica sem nenhum; hoje começa no agora. */
export function futureFree(
  date: string,
  free: ReadonlyArray<{ start: string; end: string }>,
  now: string,
): Array<{ start: string; end: string }> {
  const today = now.slice(0, 10);
  if (date < today) return [];
  if (date > today) return [...free];
  const time = now.slice(11, 16);
  return free
    .filter((gap) => gap.end > time)
    .map((gap) => (gap.start < time ? { ...gap, start: time } : { ...gap }));
}
