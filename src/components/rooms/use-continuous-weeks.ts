import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RoomsWeek } from "#/application/bookings";
import { addDays } from "#/domain/calendar";

export type LoadWeek = (start: string) => Promise<RoomsWeek>;

/** Une semanas sem duplicar dias ou ocupações; cada semana conserva seus próprios blocos. */
export function mergeWeeks(pages: readonly RoomsWeek[]): RoomsWeek {
  const first = pages[0];
  if (!first) throw new Error("A semana inicial é obrigatória.");
  const rooms = new Map<string, RoomsWeek["rooms"][number]>();
  const days = new Map<string, RoomsWeek["days"][number]>();
  for (const page of pages) {
    for (const day of page.days) days.set(day.date, day);
    for (const room of page.rooms) {
      const existing = rooms.get(room.space.id);
      const occupations = new Map((existing?.occupations ?? []).map((item) => [item.id, item]));
      for (const item of room.occupations) occupations.set(item.id, item);
      rooms.set(room.space.id, { ...room, occupations: [...occupations.values()] });
    }
  }
  return {
    ...first,
    days: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)),
    rooms: [...rooms.values()],
  };
}

/** Estado local à tela: não compartilha dados de sessões e descarta respostas de uma navegação antiga. */
export function useContinuousWeeks(initial: RoomsWeek, loadWeek?: LoadWeek) {
  const [extra, setExtra] = useState<RoomsWeek[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const state = useRef({ initial, busy: false, version: 0 });
  useEffect(() => {
    state.current = { initial, busy: false, version: state.current.version + 1 };
    setExtra([]);
    setLoading(false);
    setError(null);
    return () => {
      state.current.version += 1;
    };
  }, [initial]);
  const current = state.current.initial === initial ? extra : [];
  const week = useMemo(() => mergeWeeks([initial, ...current]), [initial, current]);
  const loadMore = useCallback(async () => {
    if (!loadWeek || state.current.busy) return;
    const version = state.current.version;
    const next = addDays(current.at(-1)?.weekStart ?? initial.weekStart, 7);
    state.current.busy = true;
    setLoading(true);
    setError(null);
    try {
      const page = await loadWeek(next);
      if (state.current.version !== version) return;
      if (page.weekStart !== next) throw new Error("Semana diferente da solicitada.");
      setExtra((pages) =>
        pages.some((item) => item.weekStart === next) ? pages : [...pages, page],
      );
    } catch {
      if (state.current.version === version)
        setError("Não foi possível carregar as próximas datas.");
    } finally {
      if (state.current.version === version) {
        state.current.busy = false;
        setLoading(false);
      }
    }
  }, [loadWeek, initial, current]);
  return { week, loading, error, loadMore };
}
