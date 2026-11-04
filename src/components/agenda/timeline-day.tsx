import { ChevronLeft, ChevronRight } from "lucide-react";
import type { AgendaItem, DayAgenda } from "#/application/bookings";
import { Button } from "#/components/ui/button";
import { addDays } from "#/domain/calendar";
import { cn } from "#/lib/utils";
import { HourAxis, makeScale } from "./agenda-blocks";
import { DayColumn, type DraftProps } from "./day-column";

export type TimelineDayProps = DraftProps & {
  dayAgenda: DayAgenda;
  onSelectSlot: (slot: { spaceId: string; date: string; start: string; end: string }) => void;
  onOpenOccupation?: ((occupation: AgendaItem) => void) | undefined;
  isVisitor: boolean;
};

export function TimelineDay({
  dayAgenda,
  onSelectSlot,
  onOpenOccupation,
  draft,
  canDraft,
  onDraftChange,
}: TimelineDayProps) {
  const scale = makeScale(dayAgenda.hours.opens, dayAgenda.hours.closes, 1.1);
  const isToday = dayAgenda.now.slice(0, 10) === dayAgenda.date;

  return (
    <div className="w-full max-w-full overflow-x-hidden select-none" data-testid="timeline-day">
      <div className="grid grid-cols-[52px_1fr] overflow-hidden rounded-lg border border-border bg-background">
        <HourAxis scale={scale} />
        <DayColumn
          day={dayAgenda}
          scale={scale}
          now={isToday ? dayAgenda.now.slice(11, 16) : null}
          onSelectSlot={onSelectSlot}
          onOpenOccupation={onOpenOccupation}
          draft={draft}
          canDraft={canDraft}
          onDraftChange={onDraftChange}
        />
      </div>
    </div>
  );
}

const MONTH_NAMES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

const SHORT_WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex"];

export type TimelineDayStripProps = {
  weekStart: string;
  selectedDate: string;
  todayDate: string;
  onSelectDate: (date: string) => void;
};

export function TimelineDayStrip({
  weekStart,
  selectedDate,
  todayDate,
  onSelectDate,
}: TimelineDayStripProps) {
  const days = [0, 1, 2, 3, 4].map((offset) => addDays(weekStart, offset));

  return (
    <section aria-label="Dias da semana" className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        className="size-8 shrink-0"
        aria-label="Semana anterior"
        onClick={() => onSelectDate(addDays(selectedDate, -7))}
      >
        <ChevronLeft className="size-4" />
      </Button>

      <div className="grid min-w-0 flex-1 grid-cols-5 gap-1">
        {days.map((dateStr, idx) => {
          const isSelected = dateStr === selectedDate;
          const isToday = dateStr === todayDate;
          const dayNum = Number(dateStr.slice(8, 10));
          const monthNum = Number(dateStr.slice(5, 7));
          return (
            <button
              key={dateStr}
              type="button"
              aria-pressed={isSelected}
              aria-label={`${dayNum} de ${MONTH_NAMES[monthNum - 1]}`}
              onClick={() => onSelectDate(dateStr)}
              className={cn(
                "flex min-w-0 flex-col items-center gap-0.5 rounded-md py-1.5 text-[11px] text-muted-foreground transition-colors",
                isSelected ? "bg-surface-2 text-foreground" : "hover:bg-surface-2/60",
              )}
            >
              <span>{SHORT_WEEKDAYS[idx]}</span>
              <span
                className={cn(
                  "grid size-7 place-items-center rounded-md text-[14px] font-semibold tabular-nums text-foreground",
                  isToday && "bg-primary text-primary-foreground",
                )}
              >
                {dayNum}
              </span>
            </button>
          );
        })}
      </div>

      <Button
        variant="ghost"
        size="icon"
        className="size-8 shrink-0"
        aria-label="Próxima semana"
        onClick={() => onSelectDate(addDays(selectedDate, 7))}
      >
        <ChevronRight className="size-4" />
      </Button>
    </section>
  );
}
