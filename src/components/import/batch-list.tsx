import { Link } from "@tanstack/react-router";
import type { BatchView } from "#/application/import-report";
import { BATCH_STATUS_LABELS, formatInstant } from "./flow-helpers";

/** Lista de lotes: semestre, data, estado e contagens; cada um abre o resultado por linha. */
export function BatchList({
  batches,
  timeZone,
}: {
  batches: readonly BatchView[];
  timeZone: string;
}) {
  if (batches.length === 0) {
    return (
      <p className="text-muted-foreground">
        Nenhum lote ainda.{" "}
        <Link to="/importar" className="font-medium text-accent-text underline">
          Importar uma grade
        </Link>
      </p>
    );
  }
  return (
    <ul className="grid gap-2">
      {batches.map((batch) => {
        const { counts } = batch.summary;
        return (
          <li key={batch.id} className="rounded-lg border bg-surface p-3">
            <Link
              to="/importar/lotes/$id"
              params={{ id: batch.id }}
              className="grid gap-1 rounded-md focus-visible:ring-[3px] focus-visible:ring-ring"
            >
              <span className="flex flex-wrap items-baseline justify-between gap-x-4">
                <span className="break-words font-medium text-accent-text underline">
                  Semestre {batch.semesterName}
                </span>
                <span className="text-sm">{BATCH_STATUS_LABELS[batch.status]}</span>
              </span>
              <span className="text-sm text-muted-foreground">
                {formatInstant(batch.createdAt, timeZone)} · arquivo {batch.hashPrefix}
              </span>
              <span className="text-sm">
                {counts.aplicada} aplicadas · {counts.nao_aplicavel} não aplicáveis ·{" "}
                {counts.conflito + counts.conflito_interno} conflitos · {counts.falha} falhas ·{" "}
                {counts.pendente} pendentes
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
