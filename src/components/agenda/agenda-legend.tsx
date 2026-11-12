import { Wrench } from "lucide-react";
import { SUBJECT_PALETTE } from "#/domain/overview";
import { TONE, toneStyle } from "#/lib/tone-style";
import { cn } from "#/lib/utils";
import { SubjectMark } from "./subject-mark";

const STATES = [
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
      <span className="flex items-center gap-1.5">
        <span aria-hidden="true" className="flex h-3 w-4 overflow-hidden rounded-[3px]">
          {SUBJECT_PALETTE.slice(0, 4).map((tone) => (
            <span
              key={tone.light}
              style={toneStyle(tone)}
              className={cn("h-full flex-1", TONE.solid)}
            />
          ))}
        </span>
        Aula importada: cor por disciplina
      </span>
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
        <SubjectMark title="ALG" />
        <span>Sigla da disciplina · consulte o título.</span>
      </span>
      <span className="flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className="h-3 w-4 rounded-[3px] border border-dashed border-line-free"
        />
        <span>Livre</span>
        <span>· arraste num horário vazio para criar um rascunho, ou use o botão direito</span>
      </span>
      <span className="flex items-center gap-1.5">
        <Wrench aria-hidden="true" className="size-3.5 text-warn-text" />
        <span>Manutenção (reserva da equipe de manutenção)</span>
      </span>
    </section>
  );
}
