import { cn } from "#/lib/utils";

export type OverviewPeriod = "Todos" | "Manhã" | "Tarde" | "Noite";

export function OverviewPeriods({
  value,
  onChange,
}: {
  value: OverviewPeriod;
  onChange: (value: OverviewPeriod) => void;
}) {
  return (
    <fieldset
      aria-label="Período"
      className="flex h-9 items-center gap-0.5 rounded-md border bg-surface p-0.5"
    >
      {(["Todos", "Manhã", "Tarde", "Noite"] as const).map((period) => (
        <button
          key={period}
          type="button"
          aria-pressed={value === period}
          onClick={() => onChange(period)}
          className={cn(
            "rounded px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground",
            value === period && "bg-surface-2 text-foreground",
          )}
        >
          {period}
        </button>
      ))}
    </fieldset>
  );
}
