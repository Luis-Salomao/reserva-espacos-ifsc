import { ChevronLeft, ChevronRight } from "lucide-react";
import type { MyBooking, MyDates, MySubject, MyWeek } from "#/application/bookings";
import { Button } from "#/components/ui/button";
import { addDays } from "#/domain/calendar";
import { WeekGrid } from "./week-grid";

type MyAgendaMode = "semana" | "todas";

export type MyAgendaViewProps = {
  subjects: MySubject[];
  subject: string | undefined;
  mode: MyAgendaMode;
  week: MyWeek;
  dates: MyDates | null;
  onSubjectChange: (key: string | undefined) => void;
  onModeChange: (mode: MyAgendaMode) => void;
  onWeekChange: (weekStart: string) => void;
  onOpen: (item: MyBooking) => void;
  onDisable: (item: MyBooking) => void;
};

const DATE = new Intl.DateTimeFormat("pt-BR", {
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  timeZone: "UTC",
});

/** Filtro de disciplina, alternância Semana/Todas as datas e o conteúdo de cada modo. */
export function MyAgendaView({
  subjects,
  subject,
  mode,
  week,
  dates,
  onSubjectChange,
  onModeChange,
  onWeekChange,
  onOpen,
  onDisable,
}: MyAgendaViewProps) {
  const open = (id: string) => {
    const found = week.items.find((item) => item.id === id);
    if (found !== undefined) onOpen(found);
  };
  return (
    <div className="grid min-w-0 gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-sm font-medium" htmlFor="my-agenda-subject">
          Disciplina
          <select
            id="my-agenda-subject"
            className="h-9 min-w-0 max-w-full rounded-md border border-border bg-background px-2 text-sm"
            value={subject ?? ""}
            onChange={(event) => onSubjectChange(event.target.value || undefined)}
          >
            <option value="">Todas</option>
            {subjects.map((entry) => (
              <option key={entry.key} value={entry.key}>
                {`${entry.label} (${entry.count})`}
              </option>
            ))}
          </select>
        </label>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant={mode === "semana" ? "default" : "outline"}
            aria-pressed={mode === "semana"}
            onClick={() => onModeChange("semana")}
          >
            Semana
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mode === "todas" ? "default" : "outline"}
            aria-pressed={mode === "todas"}
            disabled={subject === undefined}
            onClick={() => onModeChange("todas")}
          >
            Todas as datas
          </Button>
        </div>
      </div>

      {mode === "semana" || dates === null ? (
        <div className="grid min-w-0 gap-3">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-label="Semana anterior"
              onClick={() => onWeekChange(addDays(week.weekStart, -7))}
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
            </Button>
            <span className="text-sm font-medium tabular-nums">
              {week.weekStart.split("-").reverse().join("/")}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-label="Semana seguinte"
              onClick={() => onWeekChange(addDays(week.weekStart, 7))}
            >
              <ChevronRight className="size-4" aria-hidden="true" />
            </Button>
          </div>
          <div className="max-w-full overflow-x-auto">
            <div className="min-w-[640px]">
              <WeekGrid
                weekAgenda={week}
                selectedDate=""
                onSelectDate={() => {}}
                onSelectSlot={() => {}}
                onOpenOccupation={(occupation) => open(occupation.id)}
                isVisitor={false}
              />
            </div>
          </div>
        </div>
      ) : dates.items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Nenhuma data futura para esta disciplina.
        </p>
      ) : (
        <ul className="grid max-w-[760px] gap-2">
          {dates.items.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface p-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{item.title}</p>
                <p className="text-sm text-muted-foreground">
                  {DATE.format(new Date(`${item.date}T12:00:00Z`))} · {item.start}–{item.end} ·{" "}
                  {item.spaceName}
                </p>
              </div>
              {item.canCancel && (
                <Button type="button" size="sm" variant="outline" onClick={() => onDisable(item)}>
                  Desmarcar
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
