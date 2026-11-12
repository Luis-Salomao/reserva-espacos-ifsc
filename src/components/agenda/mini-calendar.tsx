import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "#/components/ui/button";
import { cn } from "#/lib/utils";

export type MiniCalendarProps = {
  selectedDate: string; // "YYYY-MM-DD"
  todayDate: string; // "YYYY-MM-DD"
  onSelectDate: (date: string) => void;
};

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

const WEEKDAY_HEADERS = [
  { id: "s1", label: "S" },
  { id: "t1", label: "T" },
  { id: "q1", label: "Q" },
  { id: "q2", label: "Q" },
  { id: "s2", label: "S" },
  { id: "s3", label: "S" },
  { id: "d1", label: "D" },
];

const STATIC_PADS = ["pad-0", "pad-1", "pad-2", "pad-3", "pad-4", "pad-5"];

export function MiniCalendar({ selectedDate, todayDate, onSelectDate }: MiniCalendarProps) {
  const [monthStr, setMonthStr] = useState(selectedDate.slice(0, 7)); // "YYYY-MM"

  useEffect(() => {
    setMonthStr(selectedDate.slice(0, 7));
  }, [selectedDate]);

  const [yearStr = "2026", monthStrPart = "11"] = monthStr.split("-");
  const year = Number(yearStr);
  const month = Number(monthStrPart);

  function handleMonthChange(delta: number) {
    const nextDate = new Date(year, month - 1 + delta, 1);
    setMonthStr(`${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, "0")}`);
  }

  // Monday offset: JS getDay() is 0 (Sunday) ... 6 (Saturday). Monday-first offset: (day + 6) % 7
  const firstDay = new Date(year, month - 1, 1);
  const offset = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month, 0).getDate();

  const emptyPads = STATIC_PADS.slice(0, offset);
  const monthDays: Array<{
    dayNum: number;
    dateStr: string;
    isWeekend: boolean;
  }> = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const jsDay = new Date(year, month - 1, d).getDay();
    const isWeekend = jsDay === 0 || jsDay === 6;
    monthDays.push({ dayNum: d, dateStr, isWeekend });
  }

  return (
    <section className="w-full select-none" aria-label="Mini calendário">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold capitalize text-foreground">
          {MONTH_NAMES[month - 1] ?? ""} {year}
        </span>
        <div className="flex items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label="Mês anterior"
            onClick={() => handleMonthChange(-1)}
          >
            <ChevronLeft className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label="Próximo mês"
            onClick={() => handleMonthChange(1)}
          >
            <ChevronRight className="size-3.5" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-0.5 text-center">
        {WEEKDAY_HEADERS.map((h) => (
          <span
            key={h.id}
            className="py-1 text-[11px] font-medium text-muted-foreground"
            aria-hidden="true"
          >
            {h.label}
          </span>
        ))}

        {emptyPads.map((padKey) => (
          <span key={padKey} aria-hidden="true" />
        ))}

        {monthDays.map((cell) => {
          const isSelected = cell.dateStr === selectedDate;
          const isToday = cell.dateStr === todayDate;

          return (
            <button
              key={cell.dateStr}
              type="button"
              onClick={() => onSelectDate(cell.dateStr)}
              aria-pressed={isSelected}
              aria-label={`${cell.dayNum} de ${MONTH_NAMES[month - 1]}`}
              className={cn(
                "flex aspect-square items-center justify-center rounded-md text-[12px] tabular-nums transition-colors",
                cell.isWeekend ? "text-muted-foreground" : "text-foreground",
                !isSelected && "hover:bg-surface-2",
                isToday && !isSelected && "font-semibold text-[var(--accent-text)]",
                isSelected && "!bg-primary !text-primary-foreground font-semibold",
              )}
            >
              {cell.dayNum}
            </button>
          );
        })}
      </div>
    </section>
  );
}
