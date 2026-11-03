import { Card } from "#/components/page";
import type { ImportRowCounts, VersionSummary } from "#/domain/import-batch";
import { resultCards, type VersionView, versionCards } from "./flow-helpers";

/** Cartões da nova versão; cada um escolhe o tipo de mudança mostrado na tabela abaixo. */
export function VersionOverview({
  version,
  affectedNames,
  active,
  onSelect,
}: {
  version: VersionSummary;
  affectedNames: readonly string[];
  active: VersionView | "";
  onSelect: (view: VersionView | "") => void;
}) {
  const cards = versionCards(version);
  return (
    <div className="grid gap-3">
      <h3 className="text-lg font-semibold">Nova versão da grade</h3>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {cards.map((card) => {
          const selected = active === card.view;
          return (
            <li key={card.view}>
              <button
                type="button"
                aria-pressed={selected}
                onClick={() => onSelect(selected ? "" : card.view)}
                className={`w-full rounded-2xl border px-3 py-2.5 text-left focus-visible:ring-[3px] focus-visible:ring-ring ${
                  selected ? "border-primary bg-occ-imported" : "bg-surface-2"
                }`}
              >
                <span className="block text-sm">{card.label}</span>
                <span className="block text-xl font-semibold">{card.display}</span>
                {selected && <span className="block text-xs">Mostrando abaixo</span>}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="text-sm">
        <p>
          <strong>Responsáveis afetados: {version.affectedUserIds.length}</strong>
        </p>
        {affectedNames.length > 0 && (
          <p className="break-words text-muted-foreground">{affectedNames.join(", ")}</p>
        )}
      </div>
    </div>
  );
}

/** Números finais depois de aplicar uma nova versão. */
export function VersionResult({ counts }: { counts: ImportRowCounts }) {
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3" aria-label="Resultado da nova versão">
      {resultCards(counts).map((card) => (
        <Card key={card.label} compact tone={card.tone} className="shadow-none">
          <dt className="text-sm">{card.label}</dt>
          <dd className="text-xl font-semibold">{card.count}</dd>
        </Card>
      ))}
    </dl>
  );
}
