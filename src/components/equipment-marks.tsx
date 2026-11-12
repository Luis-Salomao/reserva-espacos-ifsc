import { Monitor, Projector, Volume2 } from "lucide-react";
import type { ComponentType } from "react";
import {
  describeEquipment,
  EQUIPMENT,
  type EquipmentKind,
  type SpaceEquipment,
} from "#/domain/equipment";
import { cn } from "#/lib/utils";

const ICONS: Record<
  EquipmentKind,
  ComponentType<{ className?: string; "aria-hidden"?: boolean }>
> = {
  projetor: Projector,
  computadores: Monitor,
  som: Volume2,
};

type Props = {
  equipment?: SpaceEquipment | undefined;
  /** Observações livres. Visitante não recebe o texto; o parágrafo nem é montado. */
  showNotes?: boolean;
};

/**
 * Projetor, computadores e som. O ícone é decorativo; o rótulo ("não informado" quando falta
 * cadastro) fica só para leitor de tela.
 */
export function EquipmentMarks({ equipment, showNotes = false }: Props) {
  const notes = equipment?.notes ?? null;
  return (
    <div className="min-w-0">
      <fieldset
        aria-label="Equipamentos"
        className="m-0 flex min-w-0 max-w-full flex-wrap gap-1 border-0 p-0"
      >
        {EQUIPMENT.map((item) => {
          const quantity = equipment?.items[item.kind];
          const described = describeEquipment(item.kind, quantity);
          const Icon = ICONS[item.kind];
          const estado = !described.known ? "nao-informado" : quantity === 0 ? "sem" : "tem";
          return (
            <span
              key={item.kind}
              data-estado={estado}
              className={cn(
                "relative inline-flex size-6 items-center justify-center rounded border",
                estado === "tem" &&
                  "border-(--accent-text)/40 bg-(--accent-text)/10 text-(--accent-text)",
                estado === "sem" && "border-border text-muted-foreground",
                estado === "nao-informado" && "border-dashed border-border text-muted-foreground",
              )}
            >
              <Icon className="size-3.5" aria-hidden={true} />
              {estado !== "tem" && (
                <span
                  data-corte={estado}
                  aria-hidden="true"
                  className={cn(
                    "pointer-events-none absolute w-6 -rotate-45 rounded-full",
                    estado === "sem" ? "h-0.5 bg-destructive" : "h-px bg-muted-foreground/50",
                  )}
                />
              )}
              <span className="sr-only">{described.text}</span>
            </span>
          );
        })}
      </fieldset>
      {showNotes && notes !== null && notes !== "" && (
        <p className="mt-1 text-[12px] wrap-anywhere text-muted-foreground">{notes}</p>
      )}
    </div>
  );
}
