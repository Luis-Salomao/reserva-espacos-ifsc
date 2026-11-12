import { Monitor, Wrench } from "lucide-react";
import type { Space } from "#/domain/space";
import { cn } from "#/lib/utils";

const NOT_INFORMED = "Não informado";

function presenceText(value: number | undefined): string {
  if (value === undefined) return NOT_INFORMED;
  return value > 0 ? "Sim" : "Não";
}

type MaintenanceInfo = {
  total: number | undefined;
  inMaintenance: number | null | undefined;
};

function readComputers(space: Space): MaintenanceInfo {
  return {
    total: space.equipment?.items.computadores,
    inMaintenance: space.equipment?.computersInMaintenance,
  };
}

/** Badge amarelo com ícone de chave para computadores em manutenção (sempre com texto). */
function MaintenanceBadge({ label }: { label: string }) {
  return (
    <span
      role="status"
      aria-label={label}
      className="inline-flex items-center gap-1 rounded-full bg-warn px-2 py-px text-[11.5px] leading-[1.45] font-semibold whitespace-nowrap text-warn-text"
    >
      <Wrench aria-hidden="true" className="size-3" />
      {label}
    </span>
  );
}

function ComputersCompact({ total, inMaintenance }: MaintenanceInfo) {
  if (total === undefined) {
    return <span className="text-sm text-muted-foreground whitespace-nowrap">{NOT_INFORMED}</span>;
  }
  return (
    <span className="inline-flex items-center gap-2">
      <span className="inline-flex items-center gap-1 text-sm">
        <Monitor aria-hidden="true" className="size-4" />
        {total}
      </span>
      {typeof inMaintenance === "number" && inMaintenance > 0 && (
        <MaintenanceBadge label={`${inMaintenance} computadores em manutenção`} />
      )}
    </span>
  );
}

function ComputersDetailed({ total, inMaintenance }: MaintenanceInfo) {
  if (total === undefined) {
    return <p className="text-sm">{NOT_INFORMED}</p>;
  }
  return (
    <div className="grid gap-1">
      <p className="inline-flex items-center gap-1.5 text-sm">
        <Monitor aria-hidden="true" className="size-4" />
        {total}
      </p>
      {inMaintenance === null || inMaintenance === undefined ? (
        <p className="text-sm text-muted-foreground">{NOT_INFORMED}</p>
      ) : inMaintenance > 0 ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <MaintenanceBadge label={`${inMaintenance} em manutenção`} />
          <span>{total - inMaintenance} disponíveis</span>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Todos disponíveis no cadastro</p>
      )}
    </div>
  );
}

type SpaceDetailsProps = {
  space: Space;
  /** Variante compacta para o cabeçalho da sala: só o ícone, total e badge de manutenção. */
  compact?: boolean;
};

/** Painel com os dados cadastrados de capacidade e equipamentos de um espaço. */
export function SpaceDetails({ space, compact = false }: SpaceDetailsProps) {
  const computers = readComputers(space);

  if (compact) {
    return <ComputersCompact {...computers} />;
  }

  const projetor = presenceText(space.equipment?.items.projetor);
  const som = presenceText(space.equipment?.items.som);
  const notes = space.equipment?.notes ?? null;

  return (
    <section className="grid gap-3">
      <h3 className="text-[15px] font-semibold tracking-tight">Informações cadastradas</h3>
      <dl className="grid gap-2 text-sm">
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-muted-foreground">Capacidade</dt>
          <dd className="whitespace-nowrap">
            {space.capacity !== null ? `${space.capacity} pessoas` : NOT_INFORMED}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-muted-foreground">Projetor</dt>
          <dd className="whitespace-nowrap">{projetor}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-muted-foreground">Aparelho de som</dt>
          <dd className="whitespace-nowrap">{som}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-muted-foreground">Computadores</dt>
          <dd>
            <ComputersDetailed {...computers} />
          </dd>
        </div>
      </dl>
      {notes !== null && (
        <p className={cn("max-w-[360px] text-sm whitespace-pre-line [overflow-wrap:break-word]")}>
          {notes}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Dados do cadastro; não garantem que os equipamentos estão funcionando.
      </p>
    </section>
  );
}

/** Legenda dos ícones usados em `SpaceDetails` (texto sempre presente, ícones decorativos). */
export function SpaceDetailsLegend() {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <li className="inline-flex items-center gap-2">
        <Monitor aria-hidden="true" className="size-4" />
        computadores cadastrados
      </li>
      <li className="inline-flex items-center gap-2">
        <MaintenanceBadge label="N em manutenção" />
        em manutenção
      </li>
      <li className="inline-flex items-center gap-2">{NOT_INFORMED}: sem cadastro</li>
    </ul>
  );
}
