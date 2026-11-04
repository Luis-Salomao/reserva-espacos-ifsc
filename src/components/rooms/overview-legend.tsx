import { cn } from "#/lib/utils";
import { type LegendEntry, toneStyle } from "./overview-cell";

type Props = {
  entries: readonly LegendEntry[];
  /** Chave da matéria destacada; `null` sem destaque. */
  active: string | null;
  onToggle: (key: string) => void;
  className?: string;
};

/** Matérias da semana com a sua cor; clicar destaca, clicar de novo remove o destaque. */
export function OverviewLegend({ entries, active, onToggle, className }: Props) {
  return (
    <fieldset
      aria-label="Legenda"
      className={cn("flex flex-wrap content-start gap-1.5", className)}
    >
      {entries.map((entry) => (
        <button
          key={entry.key}
          type="button"
          aria-pressed={active === entry.key}
          onClick={() => onToggle(entry.key)}
          className={cn(
            "flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground",
            active === entry.key && "border-foreground text-foreground",
          )}
        >
          <span
            aria-hidden="true"
            style={toneStyle(entry.tone)}
            className="size-2.5 rounded-[2px] bg-[var(--tone-light)] dark:bg-[var(--tone-dark)]"
          />
          {entry.label}
        </button>
      ))}
    </fieldset>
  );
}
