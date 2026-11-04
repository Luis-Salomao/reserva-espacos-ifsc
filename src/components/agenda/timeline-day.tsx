import { ChevronLeft, ChevronRight, Plus, User } from "lucide-react";
import type { AgendaItem, DayAgenda } from "#/application/bookings";
import { Button } from "#/components/ui/button";
import { addDays } from "#/domain/calendar";
import { cn } from "#/lib/utils";
import { formatHourAxis, layoutEvents, timeToMinutes } from "./layout-helpers";

export type TimelineDayProps = {
  dayAgenda: DayAgenda;
  onSelectSlot: (slot: { spaceId: string; date: string; start: string; end: string }) => void;
  onOpenOccupation?: ((occupation: AgendaItem) => void) | undefined;
  isVisitor: boolean;
};

export function TimelineDay({
  dayAgenda,
  onSelectSlot,
  onOpenOccupation,
  isVisitor: _isVisitor,
}: TimelineDayProps) {
  const opensStr = dayAgenda.hours.opens ?? "06:00";
  const closesStr = dayAgenda.hours.closes ?? "23:00";
  const startHourMin = timeToMinutes(opensStr);
  const endHourMin = timeToMinutes(closesStr);
  const pxPerMin = 1.15; // Escala vertical do mobile (69 px/hora)
  const totalHeight = (endHourMin - startHourMin) * pxPerMin;

  const hours: number[] = [];
  for (let m = startHourMin; m <= endHourMin; m += 60) {
    hours.push(m);
  }

  const events = layoutEvents(dayAgenda.occupations);

  return (
    <div className="w-full max-w-full overflow-x-hidden select-none" data-testid="timeline-day">
      <div className="grid grid-cols-[44px_1fr] overflow-hidden rounded-2xl border border-border bg-background">
        {/* Eixo de Horários (44 px) */}
        <div className="relative border-r border-border bg-surface" style={{ height: totalHeight }}>
          {hours.map((m) => (
            <span
              key={m}
              className="absolute right-1.5 -translate-y-1/2 text-[11px] font-medium tabular-nums text-muted-foreground"
              style={{ top: (m - startHourMin) * pxPerMin }}
            >
              {formatHourAxis(m)}
            </span>
          ))}
        </div>

        {/* Coluna única do dia */}
        <div className="relative min-w-0" style={{ height: totalHeight }}>
          {/* Linhas horizontais de referência */}
          {hours.map((m) => (
            <div
              key={`hl-${m}`}
              className="pointer-events-none absolute inset-x-0 border-t border-border/60"
              style={{ top: (m - startHourMin) * pxPerMin }}
            />
          ))}

          {/* Intervalos livres */}
          {dayAgenda.free.map((gap) => {
            const sMin = timeToMinutes(gap.start);
            const eMin = timeToMinutes(gap.end);
            const top = (sMin - startHourMin) * pxPerMin;
            const height = Math.max(20, (eMin - sMin) * pxPerMin - 2);

            const isLunch = gap.start === "12:00" && gap.end === "13:30";
            const label = isLunch ? "Almoço" : eMin - sMin <= 30 ? "Intervalo" : "Livre";

            return (
              <button
                key={`gap-${gap.start}-${gap.end}`}
                type="button"
                onClick={() =>
                  onSelectSlot({
                    spaceId: dayAgenda.spaceId,
                    date: dayAgenda.date,
                    start: gap.start,
                    end: gap.end,
                  })
                }
                aria-label={`Livre, ${label}, ${gap.start}–${gap.end}. Reservar`}
                className="group absolute inset-x-0 mx-[3px] my-[1px] flex items-center gap-1.5 overflow-hidden rounded-lg border border-dashed border-line-free/50 bg-transparent px-2.5 text-left text-xs text-muted-foreground transition-colors hover:border-solid hover:border-line-free hover:bg-occ-free hover:text-foreground active:bg-occ-free"
                style={{ top, height }}
              >
                <span className="truncate">
                  <b className="font-semibold">{label}</b> {gap.start}–{gap.end}
                </span>
                <span className="ml-auto hidden size-4 items-center justify-center rounded-full bg-line-free text-white group-hover:inline-flex">
                  <Plus className="size-3" />
                </span>
              </button>
            );
          })}

          {/* Ocupações */}
          {events.map((ev) => {
            const top = (ev.startMinutes - startHourMin) * pxPerMin;
            const height = Math.max(20, (ev.endMinutes - ev.startMinutes) * pxPerMin - 2);
            const widthPercent = 100 / ev.lanes;
            const leftCalc = `calc(${ev.lane * widthPercent}% + 1px)`;
            const widthCalc = `calc(${widthPercent}% - 3px)`;

            const toneClass = ev.isConflict
              ? "bg-occ-conflict border-l-4 border-line-conflict bg-[repeating-linear-gradient(135deg,transparent_0_6px,rgb(196_43_39/0.16)_6px_12px)]"
              : ev.source === "import"
                ? "bg-occ-imported border-l-4 border-line-imported"
                : "bg-occ-booked border-l-4 border-line-booked";

            const tagLabel = ev.isConflict
              ? "Conflito"
              : ev.source === "import"
                ? "Aula importada"
                : "Reserva";

            return (
              <button
                key={ev.id}
                type="button"
                onClick={() => onOpenOccupation?.(ev)}
                className={cn(
                  "absolute overflow-hidden rounded-lg p-2 text-left text-xs leading-tight transition-transform transition-shadow duration-150 active:scale-[0.99]",
                  toneClass,
                )}
                style={{
                  top,
                  height,
                  left: leftCalc,
                  width: widthCalc,
                }}
              >
                <b className="block truncate text-xs font-bold text-foreground">{ev.title}</b>
                <span className="block text-[11px] tabular-nums text-muted-foreground">
                  {ev.start}–{ev.end}
                </span>
                {height >= 44 && (
                  <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
                    {ev.mine && <User className="size-3 text-foreground" />}
                    {tagLabel}
                    {ev.mine && " · sua"}
                  </span>
                )}
              </button>
            );
          })}
        </div>
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

const SHORT_WEEKDAYS = ["SEG", "TER", "QUA", "QUI", "SEX"];

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
    <section
      aria-label="Dias da semana"
      className="grid grid-cols-[36px_repeat(5,1fr)_36px] items-center gap-1"
    >
      <Button
        variant="ghost"
        size="icon"
        className="size-9"
        aria-label="Semana anterior"
        onClick={() => onSelectDate(addDays(selectedDate, -7))}
      >
        <ChevronLeft className="size-4" />
      </Button>

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
            className="flex flex-col items-center gap-0.5 rounded-xl py-1 text-[11.5px] font-semibold tracking-wider text-muted-foreground uppercase transition-colors"
          >
            <span>{SHORT_WEEKDAYS[idx]}</span>
            <span
              className={cn(
                "flex size-[34px] items-center justify-center rounded-full text-base font-bold tabular-nums text-foreground transition-colors",
                isToday && !isSelected && "ring-2 ring-primary ring-inset",
                isSelected && "bg-primary text-primary-foreground shadow-xs",
              )}
            >
              {dayNum}
            </span>
          </button>
        );
      })}

      <Button
        variant="ghost"
        size="icon"
        className="size-9"
        aria-label="Próxima semana"
        onClick={() => onSelectDate(addDays(selectedDate, 7))}
      >
        <ChevronRight className="size-4" />
      </Button>
    </section>
  );
}
