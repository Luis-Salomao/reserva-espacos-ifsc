import type { AgendaItem, WeekAgenda } from "#/application/bookings";
import { cn } from "#/lib/utils";
import {
  FreeSlot,
  gridHeight,
  HourAxis,
  HourLines,
  makeScale,
  NowLine,
  OccupationCard,
} from "./agenda-blocks";
import { layoutEvents } from "./layout-helpers";

export type WeekGridProps = {
  weekAgenda: WeekAgenda;
  selectedDate: string;
  onSelectDate: (date: string) => void;
  onSelectSlot: (slot: { spaceId: string; date: string; start: string; end: string }) => void;
  onOpenOccupation?: ((occupation: AgendaItem) => void) | undefined;
  isVisitor: boolean;
};

const WEEKDAY_NAMES = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const AXIS = "grid-cols-[52px_1fr]";

export function WeekGrid({
  weekAgenda,
  selectedDate,
  onSelectDate,
  onSelectSlot,
  onOpenOccupation,
}: WeekGridProps) {
  // Seg–sex por padrão; estende para sáb ou dom se houver ocupação.
  const days = weekAgenda.days;
  const hasSun = (days[6]?.occupations.length ?? 0) > 0;
  const hasSat = (days[5]?.occupations.length ?? 0) > 0;
  const displayDays = hasSun ? days.slice(0, 7) : hasSat ? days.slice(0, 6) : days.slice(0, 5);

  const scale = makeScale(
    displayDays[0]?.hours.opens ?? "06:00",
    displayDays[0]?.hours.closes ?? "23:00",
    0.9,
  );
  const height = gridHeight(scale);
  const todayIso = weekAgenda.now.slice(0, 10);
  const nowTime = weekAgenda.now.slice(11, 16);

  return (
    <div
      className="w-full overflow-hidden rounded-lg border border-border bg-background select-none"
      data-testid="week-grid"
    >
      <div className={cn("grid border-b border-border bg-surface", AXIS)}>
        <div className="border-r border-border" />
        <div className="grid auto-cols-fr grid-flow-col">
          {displayDays.map((day, idx) => {
            const isSelected = day.date === selectedDate;
            const isToday = day.date === todayIso;
            return (
              <button
                key={day.date}
                type="button"
                onClick={() => onSelectDate(day.date)}
                aria-pressed={isSelected}
                className={cn(
                  "flex h-10 items-center justify-center gap-1.5 border-l border-border text-[12px] text-muted-foreground transition-colors first:border-l-0 hover:bg-surface-2 hover:text-foreground",
                  isSelected && "bg-background text-foreground",
                )}
              >
                <span>{WEEKDAY_NAMES[idx] ?? ""}</span>
                <span
                  className={cn(
                    "grid min-w-6 place-items-center rounded-md px-1 py-0.5 text-[13px] font-semibold tabular-nums",
                    isToday ? "bg-primary text-primary-foreground" : "text-foreground",
                  )}
                >
                  {Number(day.date.slice(8, 10))}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className={cn("grid", AXIS)}>
        <HourAxis scale={scale} />
        <div className="grid min-w-0 auto-cols-fr grid-flow-col" style={{ height }}>
          {displayDays.map((day) => (
            <div
              key={day.date}
              className={cn(
                "relative min-w-0 border-l border-border first:border-l-0",
                day.date === todayIso && "bg-surface/60",
              )}
            >
              <HourLines scale={scale} />
              {day.free.map((gap) => (
                <FreeSlot
                  key={`gap-${day.date}-${gap.start}-${gap.end}`}
                  gap={gap}
                  scale={scale}
                  onSelect={() =>
                    onSelectSlot({
                      spaceId: weekAgenda.spaceId,
                      date: day.date,
                      start: gap.start,
                      end: gap.end,
                    })
                  }
                />
              ))}
              {layoutEvents(day.occupations).map((ev) => (
                <OccupationCard
                  key={ev.id}
                  ev={ev}
                  scale={scale}
                  onOpen={onOpenOccupation && (() => onOpenOccupation(ev))}
                />
              ))}
              {day.date === todayIso && <NowLine scale={scale} now={nowTime} />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
