import { Link } from "@tanstack/react-router";
import { useState } from "react";
import type { BatchView } from "#/application/import-report";
import { BatchCounts } from "./batch-counts";
import { BatchRows, type LoadRows } from "./batch-rows";
import { DiscardBatchButton } from "./discard-button";
import { BATCH_STATUS_LABELS, formatInstant, type VersionView } from "./flow-helpers";
import { RefreshResponsibles } from "./refresh-responsibles";
import { VersionOverview, VersionResult } from "./version-overview";

/** Lote reaberto: cabeçalho, contagens e a mesma tabela por linha do fim da importação. */
export function BatchDetail({
  batch,
  load,
  timeZone,
  onDiscarded,
}: {
  batch: BatchView;
  load: LoadRows;
  timeZone: string;
  /** Chamado depois de descartar o lote (a tela volta à lista). */
  onDiscarded: () => void;
}) {
  const [view, setView] = useState<VersionView | "">("");
  const { version } = batch.summary;
  return (
    <div className="grid gap-4">
      <div>
        <Link
          to="/importar/lotes"
          className="text-sm font-medium text-accent-text underline underline-offset-4"
        >
          Voltar à lista de lotes
        </Link>
        <h1 className="mt-2 text-[22px] leading-tight font-bold tracking-[-0.02em]">
          Lote do semestre {batch.semesterName}
        </h1>
        <p className="text-muted-foreground">
          {BATCH_STATUS_LABELS[batch.status]} · criado em {formatInstant(batch.createdAt, timeZone)}
          {batch.appliedAt !== null && ` · aplicado em ${formatInstant(batch.appliedAt, timeZone)}`}{" "}
          · arquivo {batch.hashPrefix}
        </p>
        {batch.supersedesAppliedAt !== null && (
          <p className="text-sm text-muted-foreground">
            Substitui a versão aplicada em {formatInstant(batch.supersedesAppliedAt, timeZone)}.
          </p>
        )}
      </div>
      <DiscardBatchButton batch={batch} onDiscarded={onDiscarded} />
      <RefreshResponsibles batch={batch} />
      {version !== undefined && (
        <VersionOverview
          version={version}
          affectedNames={batch.affectedNames}
          active={view}
          onSelect={setView}
        />
      )}
      {version !== undefined && batch.status === "aplicado" && (
        <VersionResult counts={batch.summary.counts} />
      )}
      <BatchCounts summary={batch.summary} />
      <section className="grid gap-3" aria-labelledby="resultado">
        <h2 id="resultado" className="text-lg font-semibold tracking-tight">
          Resultado por linha
        </h2>
        <BatchRows batchId={batch.id} load={load} view={view} />
      </section>
    </div>
  );
}
