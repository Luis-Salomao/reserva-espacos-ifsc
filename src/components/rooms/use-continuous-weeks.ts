import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RoomsWeek } from "#/application/bookings";
import { addDays } from "#/domain/calendar";

export type LoadWeek = (weekStart: string) => Promise<RoomsWeek>;

function mergeWeeks(base: RoomsWeek, extra: readonly RoomsWeek[]): RoomsWeek {
  const days = new Map<string, RoomsWeek["days"][number]>();
  const rooms = new Map<string, RoomsWeek["rooms"][number]>();
  const order: string[] = [];
  for (const source of [base, ...extra]) {
    for (const day of source.days) days.set(day.date, day);
    for (const room of source.rooms) {
      const current = rooms.get(room.space.id);
      if (current === undefined) {
        order.push(room.space.id);
        rooms.set(room.space.id, { space: room.space, occupations: [...room.occupations] });
        continue;
      }
      current.space = room.space;
      current.occupations = [...current.occupations, ...room.occupations];
    }
  }
  const mergedRooms: RoomsWeek["rooms"] = [];
  for (const id of order) {
    const room = rooms.get(id);
    if (room !== undefined) mergedRooms.push(room);
  }
  return {
    weekStart: base.weekStart,
    now: extra.at(-1)?.now ?? base.now,
    days: [...days.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)),
    rooms: mergedRooms,
  };
}

/**
 * Junta a semana inicial com as seguintes, pedidas uma a uma. Uma falha não descarta o que já
 * chegou; "Tentar novamente" repete a mesma semana.
 */
export function useContinuousWeeks(initial: RoomsWeek, loadWeek?: LoadWeek) {
  const [extra, setExtra] = useState<RoomsWeek[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(initial.weekStart);
  const busy = useRef(false);
  const asked = useRef(new Set<string>());

  useEffect(() => {
    if (started.current === initial.weekStart) return;
    started.current = initial.weekStart;
    setExtra([]);
    setError(null);
    asked.current.clear();
  }, [initial.weekStart]);

  const week = useMemo(() => mergeWeeks(initial, extra), [initial, extra]);
  const lastStart = extra.at(-1)?.weekStart ?? initial.weekStart;

  const loadMore = useCallback(async () => {
    if (!loadWeek || busy.current) return;
    const nextStart = addDays(lastStart, 7);
    if (asked.current.has(nextStart)) return;
    asked.current.add(nextStart);
    busy.current = true;
    setLoading(true);
    setError(null);
    try {
      const next = await loadWeek(nextStart);
      setExtra((current) =>
        current.some((item) => item.weekStart === next.weekStart) ? current : [...current, next],
      );
    } catch (caught) {
      asked.current.delete(nextStart);
      setError(
        caught instanceof Error ? caught.message : "Não foi possível carregar as próximas datas",
      );
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }, [lastStart, loadWeek]);

  return { week, loading, error, loadMore };
}
