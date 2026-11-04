import { cn } from "#/lib/utils";

const STATES = [
  { label: "Aula importada", swatch: "bg-occ-imported", bar: "bg-line-imported" },
  { label: "Reserva", swatch: "bg-occ-booked", bar: "bg-line-booked" },
  { label: "Conflito", swatch: "bg-occ-conflict", bar: "bg-line-conflict" },
] as const;

export function AgendaLegend({ className }: { className?: string }) {
  return (
    <section
      aria-label="Legenda de estados da agenda"
      className={cn(
        "mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-muted-foreground",
        className,
      )}
    >
      {STATES.map((state) => (
        <span key={state.label} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className={cn("relative h-3 w-4 overflow-hidden rounded-[3px]", state.swatch)}
          >
            <span className={cn("absolute inset-y-0 left-0 w-[3px]", state.bar)} />
          </span>
          {state.label}
        </span>
      ))}
      <span className="flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className="h-3 w-4 rounded-[3px] border border-dashed border-line-free"
        />
        <span>Livre</span>
        <span>· arraste num horário vazio para criar um rascunho, ou use o botão direito</span>
      </span>
    </section>
  );
}
