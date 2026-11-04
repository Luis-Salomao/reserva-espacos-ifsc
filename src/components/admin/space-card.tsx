import { useState } from "react";
import { Tag } from "#/components/ds";
import { Card, Notice } from "#/components/page";
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
import { describeEquipment, EQUIPMENT } from "#/domain/equipment";
import type { Space } from "#/domain/space";
import { cn } from "#/lib/utils";
import { deleteSpaceFn } from "#/server/admin";
import { runAdminAction } from "./use-admin-action";

type Props = {
  space: Space;
  onEdit: () => void;
  onDeleted: () => void;
};

/** Cartão do espaço: capacidade, um rótulo por equipamento do catálogo e observações. */
export function SpaceCard({ space, onEdit, onDeleted }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setDeleting(true);
    setError(null);
    const result = await runAdminAction(() => deleteSpaceFn({ data: { id: space.id } }));
    setDeleting(false);
    if (result.ok) {
      setConfirming(false);
      onDeleted();
    } else {
      setError(result.message);
    }
  }

  const notes = space.equipment?.notes ?? null;
  return (
    <li>
      <Card className="flex h-full flex-col gap-3">
        <div className="min-w-0">
          <p className="break-words font-medium">{space.name}</p>
          <p className="text-sm text-muted-foreground">
            {space.capacity === null ? "Capacidade não informada" : `${space.capacity} lugares`}
          </p>
        </div>
        <ul aria-label="Equipamentos" className="flex flex-wrap gap-1.5">
          {EQUIPMENT.map((item) => {
            const label = describeEquipment(item.kind, space.equipment?.items[item.kind]);
            return (
              <li key={item.kind}>
                <Tag
                  className={cn(!label.known && "border-dashed font-medium text-muted-foreground")}
                >
                  {label.text}
                </Tag>
              </li>
            );
          })}
        </ul>
        {notes !== null && (
          <p className="text-sm break-words whitespace-pre-line">
            <span className="font-semibold">Observações: </span>
            {notes}
          </p>
        )}
        <div className="mt-auto flex flex-wrap gap-2 border-t pt-3">
          <Button type="button" size="sm" variant="outline" onClick={onEdit}>
            Editar<span className="sr-only"> {space.name}</span>
          </Button>
          <AlertDialog
            open={confirming}
            onOpenChange={(open) => {
              setConfirming(open);
              if (!open) setError(null);
            }}
          >
            <AlertDialogTrigger asChild>
              <Button type="button" size="sm" variant="outline">
                Excluir<span className="sr-only"> {space.name}</span>
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="break-words">Excluir {space.name}?</AlertDialogTitle>
                <AlertDialogDescription>
                  O espaço e os equipamentos cadastrados nele serão apagados. Espaços com reservas,
                  aulas ou vínculo com o XML não podem ser excluídos.
                </AlertDialogDescription>
              </AlertDialogHeader>
              {error !== null && (
                <Notice tone="error" role="alert">
                  {error}
                </Notice>
              )}
              <AlertDialogFooter>
                <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
                <Button variant="destructive" onClick={() => void remove()} disabled={deleting}>
                  {deleting ? "Excluindo…" : "Excluir espaço"}
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </Card>
    </li>
  );
}
