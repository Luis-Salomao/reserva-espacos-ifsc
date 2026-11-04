import { cn } from "#/lib/utils";

export function AgendaLegend({ className }: { className?: string }) {
  return (
    <section
      aria-label="Legenda de estados da agenda"
      className={cn(
        "mt-4 flex flex-wrap items-center gap-4 text-xs text-muted-foreground",
        className,
      )}
    >
      <span className="flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className="size-3 rounded-xs border border-line-imported bg-occ-imported"
        />
        Aula importada
      </span>
      <span className="flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className="size-3 rounded-xs border border-line-booked bg-occ-booked"
        />
        Reserva
      </span>
      <span className="flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className="size-3 rounded-xs border border-line-conflict bg-occ-conflict"
        />
        Conflito
      </span>
      <span className="flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className="size-3 rounded-xs border border-dashed border-line-free bg-transparent"
        />
        Livre
      </span>
    </section>
  );
}
