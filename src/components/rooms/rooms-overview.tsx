import { useEffect, useRef, useState } from "react";
import type { AgendaItem, RoomsWeek } from "#/application/bookings";
import { weekdayOf } from "#/domain/calendar";
import { cellsFor, spanOf } from "#/domain/overview";
import { cn } from "#/lib/utils";
import { dayLabel, type LegendEntry, legendEntryOf, OverviewCell } from "./overview-cell";
import { OverviewLegend } from "./overview-legend";
import { type OverviewPick, OverviewSelection } from "./overview-selection";

type Props = {
  week: RoomsWeek;
  /** Salas que passaram nos filtros, na ordem recebida. */
  rooms: RoomsWeek["rooms"];
  isVisitor: boolean;
  /** Celular: um dia por vez, com abas de segunda a sexta. */
  compact: boolean;
  /** Dia escolhido: a aba aberta no celular. */
  selectedDate: string;
  /** Pode reservar ou é visitante (que recebe o convite para entrar): "Reservar" no painel. */
  canReserve: boolean;
  onBook: (slot: { spaceId: string; date: string; start: string; end: string }) => void;
};

const TAB_DAYS = ["Seg", "Ter", "Qua", "Qui", "Sex"];

/** Arrasto em andamento: índices dos blocos do dia onde começou e onde o ponteiro está. */
type Sweep = { date: string; from: number; to: number; spaceId: string };

const RESERVA = legendEntryOf({ source: "manual", title: "" });

function outsideLabel(items: readonly AgendaItem[]): string {
  const count = items.length === 1 ? "1 ocupação" : `${items.length} ocupações`;
  const list = items.map(
    (item) => `${item.title}, ${dayLabel(item.date)}, ${item.start}–${item.end}`,
  );
  return `${count} fora dos blocos: ${list.join("; ")}`;
}

/** Matérias das salas mostradas em ordem alfabética, com "Reserva" por último. */
function legendOf(rooms: Props["rooms"]): LegendEntry[] {
  const subjects = new Map<string, LegendEntry>();
  for (const room of rooms) {
    for (const item of room.occupations) {
      const entry = legendEntryOf(item);
      if (entry.key !== RESERVA.key) subjects.set(entry.key, entry);
    }
  }
  const sorted = [...subjects.values()].sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  return [...sorted, RESERVA];
}

/**
 * Salas × (segunda a sexta × blocos do semestre), um quadradinho por bloco, com a legenda.
 * Arrastar com o mouse num dia ou clicar num bloco seleciona o trecho e abre o painel com as salas
 * livres e ocupadas; na tela larga o painel ocupa o lugar da legenda.
 */
export function RoomsOverview({
  week,
  rooms,
  isVisitor,
  compact,
  selectedDate,
  canReserve,
  onBook,
}: Props) {
  const [highlight, setHighlight] = useState<string | null>(null);
  const [tab, setTab] = useState(() => Math.min(weekdayOf(selectedDate), week.days.length - 1));
  const [pick, setPick] = useState<OverviewPick | null>(null);
  const [sweep, setSweep] = useState<Sweep | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const shownDays = compact ? week.days.slice(tab, tab + 1) : week.days;
  const active = pick !== null && shownDays.some((day) => day.date === pick.date) ? pick : null;

  useEffect(() => {
    if (sweep === null) return;
    function finish() {
      setSweep(null);
      if (sweep === null || sweep.from === sweep.to) return;
      const blocks = week.days.find((day) => day.date === sweep.date)?.blocks ?? [];
      const range = spanOf(blocks, sweep.from, sweep.to);
      if (range !== null) setPick({ date: sweep.date, ...range, suggested: sweep.spaceId });
    }
    const cancel = () => setSweep(null);
    document.addEventListener("pointerup", finish);
    document.addEventListener("pointercancel", cancel);
    return () => {
      document.removeEventListener("pointerup", finish);
      document.removeEventListener("pointercancel", cancel);
    };
  }, [sweep, week.days]);

  const hasPick = active !== null;
  useEffect(() => {
    if (!hasPick) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setPick(null);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [hasPick]);

  const pickDate = active?.date;
  const pickStart = active?.start;
  // biome-ignore lint/correctness/useExhaustiveDependencies: rola até o painel a cada novo trecho
  useEffect(() => {
    if (compact && pickDate !== undefined) panelRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [compact, pickDate, pickStart]);

  function isSelected(date: string, index: number, block: { start: string; end: string }) {
    if (sweep !== null) {
      return (
        sweep.date === date &&
        index >= Math.min(sweep.from, sweep.to) &&
        index <= Math.max(sweep.from, sweep.to)
      );
    }
    return (
      active !== null &&
      active.date === date &&
      block.start < active.end &&
      block.end > active.start
    );
  }

  function startSweep(event: { button: number; pointerType: string }, next: Sweep) {
    if (compact || event.button !== 0 || event.pointerType === "touch") return;
    setSweep(next);
  }

  const extendSweep = (date: string, index: number) =>
    setSweep((current) =>
      current !== null && current.date === date && current.to !== index
        ? { ...current, to: index }
        : current,
    );
  const rows = rooms.map((room) => {
    const days = shownDays.map((day) =>
      cellsFor(
        room.occupations.filter((item) => item.date === day.date),
        day.blocks,
      ),
    );
    return { room, days, outside: days.flatMap((day) => day.outside) };
  });
  return (
    <div className="grid gap-3 xl:grid-cols-[max-content_minmax(12rem,1fr)] xl:items-start">
      {/* `absolute` na tela larga: legenda e painel rolam dentro da altura da grade, sem esticar a página. */}
      <div
        className={cn(
          "xl:relative xl:self-stretch",
          active === null ? "xl:order-last" : "order-last",
        )}
      >
        {active === null ? (
          <OverviewLegend
            entries={legendOf(rooms)}
            active={highlight}
            onToggle={(key) => setHighlight((current) => (current === key ? null : key))}
            className="max-h-24 overflow-y-auto xl:absolute xl:inset-0 xl:max-h-none"
          />
        ) : (
          <OverviewSelection
            ref={panelRef}
            selection={active}
            rooms={rooms}
            now={week.now}
            canReserve={canReserve}
            onRangeChange={(range) => setPick({ ...active, ...range })}
            onClose={() => setPick(null)}
            onBook={onBook}
            className="xl:absolute xl:inset-0 xl:overflow-y-auto"
          />
        )}
      </div>
      {compact && (
        <div
          role="tablist"
          aria-label="Dia da semana"
          className="flex rounded-md border bg-surface p-0.5"
        >
          {week.days.map((day, index) => (
            <button
              key={day.date}
              type="button"
              role="tab"
              aria-selected={index === tab}
              onClick={() => setTab(index)}
              className={cn(
                "h-8 flex-1 rounded-[5px] text-[12px] font-medium text-muted-foreground",
                index === tab && "bg-background text-foreground shadow-xs",
              )}
            >
              {`${TAB_DAYS[index] ?? ""} ${day.date.slice(8, 10)}`}
            </button>
          ))}
        </div>
      )}
      <div data-testid="rooms-overview" className="w-full max-w-full overflow-x-auto">
        <div
          className="grid w-max min-w-full items-center select-none"
          style={{
            gridTemplateColumns: `${compact ? "5rem" : "minmax(5rem, 9rem)"} repeat(${shownDays.length}, max-content)`,
          }}
        >
          <div />
          {shownDays.map((day) =>
            compact ? (
              <div key={day.date} className="flex gap-0.5 border-l border-border px-1 pb-1">
                {day.blocks.map((block) => (
                  <span
                    key={`${block.short}-${block.start}`}
                    title={block.label}
                    className="w-8 shrink-0 truncate text-center text-[10px] text-muted-foreground"
                  >
                    {block.short}
                  </span>
                ))}
              </div>
            ) : (
              <div
                key={day.date}
                className="border-l border-border px-1.5 pb-1 text-[12px] font-medium text-muted-foreground first-letter:uppercase"
              >
                {dayLabel(day.date)}
              </div>
            ),
          )}
          {rows.map(({ room, days, outside }) => (
            <div key={room.space.id} className="contents">
              <div className="flex min-w-0 items-center gap-1 pr-2">
                <span
                  className="truncate text-[13px] font-medium text-foreground"
                  title={room.space.name}
                >
                  {room.space.name}
                </span>
                {outside.length > 0 && (
                  <span
                    role="img"
                    data-outside={room.space.id}
                    aria-label={outsideLabel(outside)}
                    title={outsideLabel(outside)}
                    className="size-1.5 shrink-0 rounded-full bg-amber-500"
                  />
                )}
              </div>
              {shownDays.map((day, index) => (
                <div
                  key={day.date}
                  className={cn(
                    "flex border-l border-border py-[3px]",
                    compact ? "gap-0.5 px-1" : "gap-[3px] px-1.5",
                  )}
                >
                  {days[index]?.cells.map((cell, blockIndex) => (
                    <OverviewCell
                      key={`${cell.block.short}-${cell.block.start}`}
                      cell={cell}
                      room={room.space}
                      date={day.date}
                      highlight={highlight}
                      isVisitor={isVisitor}
                      compact={compact}
                      selected={isSelected(day.date, blockIndex, cell.block)}
                      onSelect={() =>
                        setPick({
                          date: day.date,
                          start: cell.block.start,
                          end: cell.block.end,
                          suggested: room.space.id,
                        })
                      }
                      onPointerDown={(event) =>
                        startSweep(event, {
                          date: day.date,
                          from: blockIndex,
                          to: blockIndex,
                          spaceId: room.space.id,
                        })
                      }
                      onPointerEnter={() => extendSweep(day.date, blockIndex)}
                    />
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
