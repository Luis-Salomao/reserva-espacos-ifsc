import { describe, expect, mock, test } from "bun:test";
import { act, renderHook } from "@testing-library/react";
import type { RoomsWeek } from "#/application/bookings";
import { mergeWeeks, useContinuousWeeks } from "./use-continuous-weeks";

const page = (date: string): RoomsWeek => ({
  weekStart: date,
  now: "2026-11-04T12:00",
  days: [{ date, blocks: [{ label: "Manhã", short: "M1", start: "08:00", end: "09:00" }] }],
  rooms: [{ space: { id: "a", name: "A-202", capacity: 30 }, occupations: [] }],
});

describe("datas contínuas", () => {
  test("une semanas mantendo dias, blocos e salas sem duplicação", () => {
    const first = page("2026-11-02");
    const next = page("2026-11-09");
    const merged = mergeWeeks([first, next, next]);
    expect(merged.days.map((day) => day.date)).toEqual(["2026-11-02", "2026-11-09"]);
    expect(merged.rooms).toHaveLength(1);
    expect(merged.days[1]?.blocks[0]?.start).toBe("08:00");
  });

  test("busca uma semana por vez e preserva as datas já abertas", async () => {
    let resolve: ((week: RoomsWeek) => void) | undefined;
    const load = mock(
      () =>
        new Promise<RoomsWeek>((done) => {
          resolve = done;
        }),
    );
    const first = page("2026-11-02");
    const { result } = renderHook(() => useContinuousWeeks(first, load));
    let pending: Promise<void> | undefined;
    act(() => {
      pending = result.current.loadMore();
      void result.current.loadMore();
    });
    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith("2026-11-09");
    await act(async () => {
      resolve?.(page("2026-11-09"));
      await pending;
    });
    expect(result.current.week.days).toHaveLength(2);
    expect(result.current.loading).toBe(false);
  });

  test("falha mantém a grade e permite tentar novamente", async () => {
    const first = page("2026-11-02");
    let fail = true;
    const load = mock(async () => {
      if (fail) throw new Error("offline");
      return page("2026-11-09");
    });
    const { result } = renderHook(() => useContinuousWeeks(first, load));
    await act(async () => {
      await result.current.loadMore();
    });
    expect(result.current.error).not.toBeNull();
    expect(result.current.week.days).toHaveLength(1);
    fail = false;
    await act(async () => {
      await result.current.loadMore();
    });
    expect(result.current.error).toBeNull();
    expect(result.current.week.days).toHaveLength(2);
  });

  test("descarta resposta antiga depois de mudar a data", async () => {
    let resolve: ((week: RoomsWeek) => void) | undefined;
    const load = () =>
      new Promise<RoomsWeek>((done) => {
        resolve = done;
      });
    const first = page("2026-11-02");
    const { result, rerender } = renderHook(({ week }) => useContinuousWeeks(week, load), {
      initialProps: { week: first },
    });
    let pending: Promise<void> | undefined;
    act(() => {
      pending = result.current.loadMore();
    });
    rerender({ week: page("2026-12-07") });
    await act(async () => {
      resolve?.(page("2026-11-09"));
      await pending;
    });
    expect(result.current.week.days.map((day) => day.date)).toEqual(["2026-12-07"]);
  });
});
