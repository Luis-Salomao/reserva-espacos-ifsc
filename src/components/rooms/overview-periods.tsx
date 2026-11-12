import { cn } from "#/lib/utils";

/** Faixa da grade: todos os blocos ou só manhã, tarde ou noite. */
export type OverviewPeriod = "Todos" | "Manhã" | "Tarde" | "Noite";

const PERIODS: readonly OverviewPeriod[] = ["Todos", "Manhã", "Tarde", "Noite"];

type Props = {
  value: OverviewPeriod;
  onChange: (period: OverviewPeriod) => void;
};

/** Manhã, tarde ou noite da visão geral. O botão marcado usa `aria-pressed`. */
export function OverviewPeriods({ value, onChange }: Props) {
  return (
    <fieldset
      aria-label="Período"
      className="flex min-w-0 flex-wrap rounded-md border bg-surface p-0.5"
    >
      {PERIODS.map((period) => (
        <button
          key={period}
          type="button"
          aria-pressed={value === period}
          onClick={() => onChange(period)}
          className={cn(
            "min-h-11 rounded-[5px] px-2.5 py-1 text-[12px] font-medium text-muted-foreground hover:text-foreground",
            value === period && "bg-background text-foreground shadow-xs",
          )}
        >
          {period}
        </button>
      ))}
    </fieldset>
  );
}
