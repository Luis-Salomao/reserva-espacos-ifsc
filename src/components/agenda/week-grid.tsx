import { Plus, User } from "lucide-react";
import type { AgendaItem, WeekAgenda } from "#/application/bookings";
import { cn } from "#/lib/utils";
import { formatHourAxis, layoutEvents, timeToMinutes } from "./layout-helpers";

export type WeekGridProps = {
  weekAgenda: WeekAgenda;
  selectedDate: string;
  onSelectDate: (date: string) => void;
  onSelectSlot: (slot: { spaceId: string; date: string; start: string; end: string }) => void;
  onOpenOccupation?: ((occupation: AgendaItem) => void) | undefined;
  isVisitor: boolean;
};

const WEEKDAY_NAMES = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

export function WeekGrid({
  weekAgenda,
  selectedDate,
  onSelectDate,
  onSelectSlot,
  onOpenOccupation,
  isVisitor: _isVisitor,
}: WeekGridProps) {
  // Regra de exibição de fins de semana: seg–sex por padrão, estende para sáb ou dom se houver ocupação
  const days = weekAgenda.days;
  const hasSun = (days[6]?.occupations.length ?? 0) > 0;
  const hasSat = (days[5]?.occupations.length ?? 0) > 0;
  const displayDays = hasSun ? days.slice(0, 7) : hasSat ? days.slice(0, 6) : days.slice(0, 5);

  const opensStr = displayDays[0]?.hours.opens ?? "06:00";
  const closesStr = displayDays[0]?.hours.closes ?? "23:00";
  const startHourMin = timeToMinutes(opensStr);
  const endHourMin = timeToMinutes(closesStr);
  const pxPerMin = 0.95; // Escala vertical do desktop (57 px/hora)
  const totalHeight = (endHourMin - startHourMin) * pxPerMin;

  // Marcadores de hora cheia
  const hours: number[] = [];
  for (let m = startHourMin; m <= endHourMin; m += 60) {
    hours.push(m);
  }

  const todayIso = weekAgenda.now.slice(0, 10);

  return (
    <div className="w-full select-none" data-testid="week-grid">
      {/* 1. Barra de Cabeçalhos: Dias da semana + Número do dia */}
      <div className="ml-[44px] grid grid-flow-col auto-cols-fr rounded-t-2xl border border-b-0 border-border bg-surface">
        {displayDays.map((day, idx) => {
          const isSelected = day.date === selectedDate;
          const isToday = day.date === todayIso;
          const dayNum = Number(day.date.slice(8, 10));

          return (
            <button
              key={day.date}
              type="button"
              onClick={() => onSelectDate(day.date)}
              className={cn(
                "flex items-baseline justify-center gap-1.5 border-l border-border px-2 py-2.5 text-xs font-medium text-muted-foreground transition-colors first:border-l-0 hover:bg-surface-2",
                isSelected && "bg-background text-foreground",
              )}
            >
              <span>{WEEKDAY_NAMES[idx] ?? ""}</span>
              {isToday ? (
                <span className="rounded-full bg-primary px-2 py-0.5 text-sm font-bold text-primary-foreground">
                  {dayNum}
                </span>
              ) : (
                <span
                  className={cn(
                    "text-lg font-bold tracking-tight",
                    isSelected ? "text-primary" : "text-foreground",
                  )}
                >
                  {dayNum}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* 2. Corpo da Grade: Eixo de 44 px + Colunas dos dias */}
      <div className="grid grid-cols-[44px_1fr] overflow-hidden rounded-b-2xl border border-border bg-background">
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

        {/* Colunas dos dias */}
        <div className="grid min-w-0 grid-flow-col auto-cols-fr" style={{ height: totalHeight }}>
          {displayDays.map((day) => {
            const events = layoutEvents(day.occupations);

            return (
              <div
                key={day.date}
                className="relative min-w-0 border-l border-border first:border-l-0"
              >
                {/* Linhas horizontais de referência */}
                {hours.map((m) => (
                  <div
                    key={`hl-${m}`}
                    className="pointer-events-none absolute inset-x-0 border-t border-border/60"
                    style={{ top: (m - startHourMin) * pxPerMin }}
                  />
                ))}

                {/* Intervalos livres clicáveis */}
                {day.free.map((gap) => {
                  const sMin = timeToMinutes(gap.start);
                  const eMin = timeToMinutes(gap.end);
                  const top = (sMin - startHourMin) * pxPerMin;
                  const height = Math.max(16, (eMin - sMin) * pxPerMin - 2);

                  const isLunch = gap.start === "12:00" && gap.end === "13:30";
                  const label = isLunch ? "Almoço" : eMin - sMin <= 30 ? "Intervalo" : "Livre";

                  return (
                    <button
                      key={`gap-${day.date}-${gap.start}-${gap.end}`}
                      type="button"
                      onClick={() =>
                        onSelectSlot({
                          spaceId: weekAgenda.spaceId,
                          date: day.date,
                          start: gap.start,
                          end: gap.end,
                        })
                      }
                      aria-label={`Livre, ${label}, ${gap.start}–${gap.end}. Reservar`}
                      className="group absolute inset-x-0 mx-[3px] my-[1px] flex items-center gap-1.5 overflow-hidden rounded-lg border border-dashed border-line-free/50 bg-transparent px-2 text-left text-xs text-muted-foreground transition-colors hover:border-solid hover:border-line-free hover:bg-occ-free hover:text-foreground focus-visible:border-solid focus-visible:border-line-free focus-visible:bg-occ-free"
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
                  const height = Math.max(18, (ev.endMinutes - ev.startMinutes) * pxPerMin - 2);
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
                        "absolute overflow-hidden rounded-lg p-1.5 text-left text-xs leading-tight transition-transform transition-shadow duration-150 hover:z-10 hover:-translate-y-px hover:shadow-md",
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
                      {height >= 40 && (
                        <span className="mt-1 inline-flex items-center gap-1 text-[10.5px] font-semibold text-muted-foreground">
                          {ev.mine && <User className="size-2.5 text-foreground" />}
                          {tagLabel}
                          {ev.mine && " · sua"}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
