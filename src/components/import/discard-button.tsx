import { useState } from "react";
import { runAdminAction } from "#/components/admin/use-admin-action";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "#/components/ui/alert-dialog";
import { Button } from "#/components/ui/button";
import type { ImportBatch } from "#/domain/import-batch";
import { discardImportBatchFn } from "#/server/import-fns";
import { discardState } from "./flow-helpers";

type Props = {
  batch: Pick<ImportBatch, "id" | "status" | "summary">;
  onDiscarded: () => void;
};

/**
 * Descarta um lote ainda não aplicado, com confirmação. Aparece só em lotes preparando, aguardando
 * ou interrompidos; fica desabilitado, com a explicação ao lado, quando o lote já aplicou parte.
 */
export function DiscardBatchButton({ batch, onDiscarded }: Props) {
  const state = discardState(batch);
  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!state.visible) return null;

  async function discard() {
    setWorking(true);
    setError(null);
    const result = await runAdminAction(() =>
      discardImportBatchFn({ data: { batchId: batch.id } }),
    );
    setWorking(false);
    if (result.ok) {
      setOpen(false);
      onDiscarded();
    } else {
      setError(result.message);
    }
  }

  const hintId = `descartar-${batch.id}`;
  return (
    <div className="grid gap-1">
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger asChild>
          <Button
            variant="outline"
            disabled={!state.allowed}
            aria-describedby={state.reason === null ? undefined : hintId}
            className="justify-self-start"
          >
            Descartar lote
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Descartar este lote?</AlertDialogTitle>
            <AlertDialogDescription>
              O lote e o resultado de suas linhas serão apagados. Nenhuma ocupação foi criada ou
              cancelada por ele. Para importar de novo, envie o arquivo outra vez.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error !== null && (
            <p role="alert" className="rounded-lg border bg-occ-conflict p-3 text-sm">
              {error}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={working}>Manter o lote</AlertDialogCancel>
            <Button onClick={() => void discard()} disabled={working}>
              {working ? "Descartando…" : "Descartar"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {state.reason !== null && (
        <p id={hintId} className="text-sm text-muted-foreground">
          {state.reason}
        </p>
      )}
    </div>
  );
}
