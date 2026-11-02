import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { BatchView } from "#/application/import-report";
import { runAdminAction } from "#/components/admin/use-admin-action";
import { Button } from "#/components/ui/button";
import { pendingTotal } from "#/domain/import-batch";
import type { ImportConflictKind } from "#/domain/import-conflicts";
import { listImportBatchesFn } from "#/server/import-fns";
import { DiscardBatchButton } from "./discard-button";

const STALE_NOTICE = "Uma versão mais nova já foi aplicada; envie o arquivo novamente.";

type Props = {
  kind: ImportConflictKind;
  message: string;
  semesterId: string;
  disabled: boolean;
  /** Retoma a aplicação do lote em andamento. */
  onResume: (batchId: string, total: number) => void;
  /** O lote em andamento foi descartado: dá para conferir de novo. */
  onCleared: () => void;
};

/** Aviso do conflito tipado ao preparar/aplicar: outro lote em andamento (busy) ou preparo defasado (stale). */
export function ConflictNotice({
  kind,
  message,
  semesterId,
  disabled,
  onResume,
  onCleared,
}: Props) {
  const [inProgress, setInProgress] = useState<BatchView | null | undefined>(undefined);

  useEffect(() => {
    if (kind !== "busy") return;
    let cancelled = false;
    void runAdminAction(() => listImportBatchesFn()).then((result) => {
      if (cancelled) return;
      const found = result.ok
        ? result.data.find(
            (batch) =>
              batch.semesterId === semesterId &&
              (batch.status === "aplicando" || batch.status === "falhou"),
          )
        : undefined;
      setInProgress(found ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [kind, semesterId]);

  if (kind === "stale") {
    return (
      <div role="alert" className="grid gap-2 rounded-lg border bg-occ-conflict p-4">
        <p>{STALE_NOTICE}</p>
      </div>
    );
  }
  return (
    <div role="alert" className="grid gap-3 rounded-lg border bg-occ-conflict p-4">
      <p>{message}</p>
      {inProgress === undefined && <p className="text-sm">Procurando o lote em andamento…</p>}
      {inProgress === null && (
        <p className="text-sm">
          Não foi possível localizar o lote em andamento.{" "}
          <Link to="/importar/lotes" className="font-medium text-accent-text underline">
            Ver a lista de lotes
          </Link>
        </p>
      )}
      {inProgress !== undefined && inProgress !== null && (
        <div className="grid gap-2">
          <Link
            to="/importar/lotes/$id"
            params={{ id: inProgress.id }}
            className="justify-self-start text-sm font-medium text-accent-text underline"
          >
            Abrir o lote em andamento
          </Link>
          <div className="flex flex-wrap items-start gap-3">
            <Button
              disabled={disabled}
              onClick={() => onResume(inProgress.id, pendingTotal(inProgress.summary.counts))}
            >
              Retomar
            </Button>
            <DiscardBatchButton batch={inProgress} onDiscarded={onCleared} />
          </div>
        </div>
      )}
    </div>
  );
}
