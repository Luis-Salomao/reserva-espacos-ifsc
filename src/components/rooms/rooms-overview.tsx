import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";
import type { AgendaItem, RoomsWeek } from "#/application/bookings";
import { RoomDetailsButton } from "#/components/rooms/room-details-popover";
import { SpaceDetails, SpaceDetailsLegend } from "#/components/spaces/space-details";
import { Button } from "#/components/ui/button";
import { weekdayOf } from "#/domain/calendar";
import { cellsFor, spanOf } from "#/domain/overview";
import { blockOf, floorOf } from "#/domain/room-filter";
import type { Space } from "#/domain/space";
import { cn } from "#/lib/utils";
import { dayLabel, type LegendEntry, legendEntryOf, OverviewCell } from "./overview-cell";
import { OverviewLegend } from "./overview-legend";
import { type OverviewPeriod, OverviewPeriods } from "./overview-periods";
import { type OverviewPick, OverviewSelection } from "./overview-selection";

type Props = {
  selectedPeriod?: OverviewPeriod;
  week: RoomsWeek;
  /** Salas que passaram nos filtros, na ordem recebida. */
  rooms: RoomsWeek["rooms"];
  isVisitor: boolean;
  /** Celular: um dia por vez, com abas de segunda a sexta. */
  compact: boolean;
  /** Um dia por vez em qualquer largura (cartões por sala), sem as abas da semana. */
  dayMode?: boolean;
  /** Dia escolhido: a aba aberta no celular. */
  selectedDate: string;
  /** Pode reservar ou é visitante (que recebe o convite para entrar): "Reservar" no painel. */
  canReserve: boolean;
  onBook: (slot: { spaceId: string; date: string; start: string; end: string }) => void;
  onNewBooking?: () => void;
  /** Espaços por id (capacidade/equipamentos) para o badge compacto e o botão "Detalhes". */
  spacesIndex?: Record<string, Space>;
};

const periodOf = (start: string) =>
  start < "12:00" ? "Manh\u00e3" : start < "18:00" ? "Tarde" : "Noite";

const TAB_DAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

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
 * Um dia por seção (segunda a sexta, empilhados): salas nas linhas, blocos de horário nas colunas,
 * um quadradinho por bloco, com a legenda. Arrastar com o mouse numa sala do dia ou clicar num bloco
 * seleciona o trecho e abre o painel com as salas livres e ocupadas.
 */
export function RoomsOverview({
  week: initialWeek,
  rooms: initialRooms,
  selectedPeriod,
  isVisitor,
  compact,
  dayMode = false,
  selectedDate,
  canReserve,
  onBook,
  onNewBooking,
  spacesIndex = {},
}: Props) {
  const week = initialWeek;
  const allowedRooms = new Set(initialRooms.map((room) => room.space.id));
  const rooms = week.rooms.filter((room) => allowedRooms.has(room.space.id));
  const [localPeriod, setLocalPeriod] = useState<OverviewPeriod>("Todos");
  const period = selectedPeriod ?? localPeriod;
  const [collapsedBlocks, setCollapsedBlocks] = useState<Set<string>>(new Set());
  const [highlight, setHighlight] = useState<string | null>(null);
  const [tab, setTab] = useState(() => Math.min(weekdayOf(selectedDate), week.days.length - 1));
  const [pick, setPick] = useState<OverviewPick | null>(null);
  const [sweep, setSweep] = useState<Sweep | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  // Chave estável: um objeto de semana novo com os mesmos dias não reinicia a aba escolhida.
  const dayKey = week.days.map((day) => day.date).join(",");
  useEffect(() => {
    const selectedIndex = dayKey.split(",").indexOf(selectedDate);
    if (selectedIndex >= 0) setTab(selectedIndex);
  }, [selectedDate, dayKey]);
  const single = compact || dayMode;
  const shownDays = (single ? week.days.slice(tab, tab + 1) : week.days).map((day) => ({
    ...day,
    blocks: day.blocks.filter((block) => period === "Todos" || periodOf(block.start) === period),
  }));
  useEffect(() => {
    void period;
    setPick(null);
    setSweep(null);
  }, [period]);
  const active = pick !== null && shownDays.some((day) => day.date === pick.date) ? pick : null;

  useEffect(() => {
    if (sweep === null) return;
    function finish() {
      setSweep(null);
      if (sweep === null || sweep.from === sweep.to) return;
      const blocks = shownDays.find((day) => day.date === sweep.date)?.blocks ?? [];
      const range = spanOf(blocks, sweep.from, sweep.to);
      if (range !== null) {
        const origin = {
          from: Math.min(sweep.from, sweep.to),
          to: Math.max(sweep.from, sweep.to),
        };
        setPick({ date: sweep.date, ...range, suggested: sweep.spaceId, origin });
      }
    }
    const cancel = () => setSweep(null);
    document.addEventListener("pointerup", finish);
    document.addEventListener("pointercancel", cancel);
    return () => {
      document.removeEventListener("pointerup", finish);
      document.removeEventListener("pointercancel", cancel);
    };
  }, [sweep, shownDays]);

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
    if (single && pickDate !== undefined) panelRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [single, pickDate, pickStart]);

  function isSelected(
    spaceId: string,
    date: string,
    index: number,
    block: { start: string; end: string },
  ) {
    if (sweep !== null) {
      return (
        sweep.date === date &&
        sweep.spaceId === spaceId &&
        index >= Math.min(sweep.from, sweep.to) &&
        index <= Math.max(sweep.from, sweep.to)
      );
    }
    if (active === null || active.date !== date || active.suggested !== spaceId) return false;
    if (active.origin !== undefined)
      return index >= active.origin.from && index <= active.origin.to;
    return block.start < active.end && block.end > active.start;
  }

  function startSweep(event: { button: number; pointerType: string }, next: Sweep) {
    if (single || event.button !== 0 || event.pointerType === "touch") return;
    setSweep(next);
  }

  const extendSweep = (date: string, index: number) =>
    setSweep((current) =>
      current !== null && current.date === date && current.to !== index
        ? { ...current, to: index }
        : current,
    );
  const place = (name: string) => {
    const block = blockOf(name);
    const floor = floorOf(name);
    return block === null
      ? "Outros espa\u00e7os"
      : `Bloco ${block}${floor === null ? "" : ` \u00b7 Andar ${floor}`}`;
  };
  const orderedRooms = [...rooms].sort((a, b) =>
    `${place(a.space.name)} ${a.space.name}`.localeCompare(
      `${place(b.space.name)} ${b.space.name}`,
      "pt-BR",
      { numeric: true },
    ),
  );
  const rows = orderedRooms.map((room) => {
    const days = shownDays.map((day) => {
      const items = room.occupations.filter((item) => item.date === day.date);
      return {
        ...cellsFor(items, day.blocks),
        outside: cellsFor(
          items,
          week.days.find((original) => original.date === day.date)?.blocks ?? [],
        ).outside,
      };
    });
    return { room, days, outside: days.flatMap((day) => day.outside) };
  });
  const mobileDay = shownDays[0] ?? null;
  return (
    <div className="grid gap-3">
      {selectedPeriod === undefined && <OverviewPeriods value={period} onChange={setLocalPeriod} />}
      <div className="flex items-center justify-between gap-3 rounded-lg border bg-surface-2 px-4 py-3">
        <p className="min-w-0 text-sm font-medium text-foreground">
          Para reservar, clique ou arraste nos quadradinhos livres da sala desejada.
        </p>
        {canReserve && onNewBooking && (
          <Button type="button" size="lg" onClick={onNewBooking}>
            <Plus aria-hidden="true" /> Nova reserva
          </Button>
        )}
      </div>
      {/* `absolute` na tela larga: legenda e painel rolam dentro da altura da grade, sem esticar a página. */}
      <div className={cn(active === null ? "order-last" : "")}>
        {active === null ? (
          <details className="rounded-lg border px-3 py-2">
            <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
              Cores e padrões das disciplinas
            </summary>
            <OverviewLegend
              entries={legendOf(rooms)}
              active={highlight}
              onToggle={(key) => setHighlight((current) => (current === key ? null : key))}
              className="mt-3 max-h-40 overflow-y-auto"
            />
          </details>
        ) : null}
        {active === null && (
          <details className="mt-3 rounded-lg border px-3 py-2">
            <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
              Informações das salas
            </summary>
            <SpaceDetailsLegend />
          </details>
        )}
        {active !== null && (
          <OverviewSelection
            ref={panelRef}
            selection={active}
            rooms={rooms}
            now={week.now}
            canReserve={canReserve}
            showNotes={!isVisitor}
            onRangeChange={({ start, end }) =>
              setPick({ date: active.date, suggested: active.suggested, start, end })
            }
            onClose={() => setPick(null)}
            onBook={onBook}
            className="max-h-96 overflow-y-auto"
          />
        )}
      </div>
      {compact && !dayMode && (
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
      {single && mobileDay !== null && (
        <section
          aria-label={`Disponibilidade por sala em ${dayLabel(mobileDay.date)}`}
          className="grid gap-3"
        >
          <p className="text-sm text-muted-foreground">
            Toque em um horário para consultar a disponibilidade e escolher uma sala.
          </p>
          {rows.map(({ room, days }) => {
            const day = mobileDay;
            const cells = days[0]?.cells ?? [];
            return (
              <article
                key={room.space.id}
                className="grid gap-2 rounded-xl border border-border bg-surface p-3"
              >
                <header className="flex min-w-0 items-center justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold text-foreground">{room.space.name}</h3>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      {spacesIndex[room.space.id] ? (
                        <SpaceDetails space={spacesIndex[room.space.id] as Space} compact />
                      ) : null}
                      <RoomDetailsButton
                        space={spacesIndex[room.space.id]}
                        roomName={room.space.name}
                      />
                    </div>
                  </div>
                </header>
                <div
                  className={cn(
                    "grid grid-cols-2 gap-2",
                    dayMode && "sm:grid-cols-3 xl:grid-cols-4",
                  )}
                >
                  {cells.map((cell) => {
                    const occupied = cell.items.length > 0;
                    const labels = cell.items.map(({ item }) => item.title).join(", ");
                    return (
                      <button
                        key={`${cell.block.short}-${cell.block.start}`}
                        type="button"
                        onClick={() =>
                          setPick({
                            date: day.date,
                            start: cell.block.start,
                            end: cell.block.end,
                            suggested: room.space.id,
                          })
                        }
                        aria-label={`${room.space.name}, ${cell.block.label}, ${cell.block.start}–${cell.block.end}: ${occupied ? labels : "livre"}`}
                        className={cn(
                          "grid min-h-14 content-center gap-0.5 rounded-lg border px-2 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          occupied
                            ? "border-line-imported bg-occ-imported text-foreground"
                            : "border-border bg-background text-foreground hover:border-primary hover:bg-primary/5",
                          active?.date === day.date &&
                            active.suggested === room.space.id &&
                            cell.block.start < active.end &&
                            cell.block.end > active.start &&
                            "ring-2 ring-primary",
                        )}
                      >
                        <span className="text-xs font-semibold tabular-nums">
                          {cell.block.start}–{cell.block.end}
                        </span>
                        <span className="truncate text-xs">{occupied ? labels : "Livre"}</span>
                      </button>
                    );
                  })}
                </div>
              </article>
            );
          })}
        </section>
      )}
      <div
        data-testid="rooms-overview"
        className={cn("grid gap-6 select-none", single && "hidden")}
      >
        {!single &&
          shownDays.map((day, dayIndex) => {
            const label = dayLabel(day.date);
            const today = day.date === week.now.slice(0, 10);
            return (
              <section
                key={day.date}
                aria-label={`Ocupação em ${label}`}
                data-today={today ? "" : undefined}
                className="grid gap-2"
              >
                <h3
                  className={cn(
                    "flex items-center gap-2 text-sm font-semibold capitalize",
                    today && "text-primary",
                  )}
                >
                  {label}
                  {today && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium normal-case">
                      Hoje
                    </span>
                  )}
                </h3>
                <div
                  className={cn(
                    "w-full max-w-full overflow-x-auto rounded-lg border border-divider lg:overflow-x-visible",
                    today && "border-primary/40",
                  )}
                >
                  <table
                    aria-label={label}
                    className="w-full min-w-max border-collapse lg:min-w-full"
                  >
                    <thead className="sticky top-0 z-30 bg-surface">
                      <tr className="border-b border-divider">
                        <th
                          scope="col"
                          className={cn(
                            "sticky left-0 z-20 bg-surface px-2 py-1.5 text-left text-xs font-semibold text-muted-foreground",
                            compact ? "w-32" : "w-44",
                          )}
                        >
                          Sala
                        </th>
                        {day.blocks.map((block) => (
                          <th
                            key={`${block.short}-${block.start}`}
                            scope="col"
                            title={`${periodOf(block.start)} ${block.start}–${block.end}`}
                            className="min-w-14 px-1 py-1.5 text-center text-[11px] font-normal tabular-nums text-muted-foreground"
                          >
                            <span className="block font-semibold text-foreground">
                              {block.label}
                            </span>
                            <span className="block">{`${block.start}–${block.end}`}</span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(({ room, days }, rowIndex) => {
                        const block = blockOf(room.space.name) ?? "Outros";
                        const first =
                          rowIndex === 0 ||
                          (blockOf(rows[rowIndex - 1]?.room.space.name ?? "") ?? "Outros") !==
                            block;
                        const collapsed = collapsedBlocks.has(block);
                        if (collapsed && !first) return null;
                        const dayOutside = days[dayIndex]?.outside ?? [];
                        return (
                          <Fragment key={room.space.id}>
                            {first && (
                              <tr className="border-b border-divider bg-surface-2">
                                <td colSpan={day.blocks.length + 1} className="p-0">
                                  <button
                                    type="button"
                                    aria-label={`${collapsed ? "Expandir" : "Recolher"} ${block === "Outros" ? "Outros espaços" : `Bloco ${block}`}`}
                                    aria-expanded={!collapsed}
                                    onClick={() =>
                                      setCollapsedBlocks((current) => {
                                        const next = new Set(current);
                                        if (next.has(block)) next.delete(block);
                                        else next.add(block);
                                        return next;
                                      })
                                    }
                                    className="sticky left-0 flex items-center gap-2 px-2 py-2 text-xs font-semibold"
                                  >
                                    {collapsed ? (
                                      <ChevronRight className="size-3.5" aria-hidden="true" />
                                    ) : (
                                      <ChevronDown className="size-3.5" aria-hidden="true" />
                                    )}
                                    {block === "Outros" ? "Outros espaços" : `Bloco ${block}`}
                                  </button>
                                </td>
                              </tr>
                            )}
                            {!collapsed && (
                              <>
                                {(rowIndex === 0 ||
                                  place(rows[rowIndex - 1]?.room.space.name ?? "") !==
                                    place(room.space.name)) &&
                                  floorOf(room.space.name) !== null && (
                                    <tr>
                                      <td
                                        colSpan={day.blocks.length + 1}
                                        className="px-2 pt-2 pb-1 text-[11px] text-muted-foreground"
                                      >
                                        <span className="sticky left-2">{`Andar ${floorOf(room.space.name)}`}</span>
                                      </td>
                                    </tr>
                                  )}
                                <tr className="border-b border-divider last:border-b-0">
                                  <th
                                    scope="row"
                                    className="sticky left-0 z-10 border-r border-divider bg-surface px-2 py-1 text-left font-normal"
                                  >
                                    <div className="flex min-w-0 flex-wrap items-center gap-1">
                                      <span
                                        className="truncate text-[13px] font-medium text-foreground"
                                        title={room.space.name}
                                      >
                                        {room.space.name}
                                      </span>
                                      {dayOutside.length > 0 && (
                                        <span
                                          role="img"
                                          data-outside={room.space.id}
                                          aria-label={outsideLabel(dayOutside)}
                                          title={outsideLabel(dayOutside)}
                                          className="size-1.5 shrink-0 rounded-full bg-amber-500"
                                        />
                                      )}
                                      {spacesIndex[room.space.id] && (
                                        <SpaceDetails
                                          space={spacesIndex[room.space.id] as Space}
                                          compact
                                        />
                                      )}
                                      <RoomDetailsButton
                                        space={spacesIndex[room.space.id]}
                                        roomName={room.space.name}
                                      />
                                    </div>
                                  </th>
                                  {days[dayIndex]?.cells.map((cell, blockIndex) => (
                                    <td
                                      key={`${cell.block.short}-${cell.block.start}`}
                                      className="py-1 text-center"
                                    >
                                      <OverviewCell
                                        cell={cell}
                                        room={room.space}
                                        date={day.date}
                                        highlight={highlight}
                                        isVisitor={isVisitor}
                                        compact={compact}
                                        selected={isSelected(
                                          room.space.id,
                                          day.date,
                                          blockIndex,
                                          cell.block,
                                        )}
                                        onSelect={() =>
                                          setPick({
                                            date: day.date,
                                            start: cell.block.start,
                                            end: cell.block.end,
                                            suggested: room.space.id,
                                            origin: { from: blockIndex, to: blockIndex },
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
                                    </td>
                                  ))}
                                </tr>
                              </>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
      </div>
    </div>
  );
}
