import { Link } from "@tanstack/react-router";
import type { BatchView } from "#/application/import-report";
import { BatchCounts } from "./batch-counts";
import { BatchRows, type LoadRows } from "./batch-rows";
import { BATCH_STATUS_LABELS, formatInstant } from "./flow-helpers";

/** Lote reaberto: cabeçalho, contagens e a mesma tabela por linha do fim da importação. */
export function BatchDetail({ batch, load }: { batch: BatchView; load: LoadRows }) {
  return (
    <div className="grid gap-4">
      <div>
        <Link to="/importar/lotes" className="text-sm font-medium text-accent-text underline">
          Voltar à lista de lotes
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">Lote do semestre {batch.semesterName}</h1>
        <p className="text-muted-foreground">
          {BATCH_STATUS_LABELS[batch.status]} · criado em {formatInstant(batch.createdAt)}
          {batch.appliedAt !== null && ` · aplicado em ${formatInstant(batch.appliedAt)}`} · arquivo{" "}
          {batch.hashPrefix}
        </p>
      </div>
      <BatchCounts summary={batch.summary} />
      <section className="grid gap-3" aria-labelledby="resultado">
        <h2 id="resultado" className="text-xl font-semibold">
          Resultado por linha
        </h2>
        <BatchRows batchId={batch.id} load={load} />
      </section>
    </div>
  );
}
