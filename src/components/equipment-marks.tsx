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
      <div role="group" aria-label="Equipamentos" className="flex flex-wrap gap-1">
        {EQUIPMENT.map((item) => {
          const quantity = equipment?.items[item.kind];
          const described = describeEquipment(item.kind, quantity);
          const Icon = ICONS[item.kind];
          return (
            <span
              key={item.kind}
              className={cn(
                "inline-flex size-6 items-center justify-center rounded border border-border text-foreground",
                !described.known && "border-dashed text-muted-foreground",
                described.known && quantity === 0 && "opacity-40",
              )}
            >
              <Icon className="size-3.5" aria-hidden={true} />
              <span className="sr-only">{described.text}</span>
            </span>
          );
        })}
      </div>
      {showNotes && notes !== null && notes !== "" && (
        <p className="mt-1 text-[12px] wrap-anywhere text-muted-foreground">{notes}</p>
      )}
    </div>
  );
}
