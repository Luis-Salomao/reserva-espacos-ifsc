import { useRef, useState } from "react";
import { Notice } from "#/components/page";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "#/components/ui/alert-dialog";
import { Button } from "#/components/ui/button";
import type { Space } from "#/domain/space";
import { deleteSpaceFn } from "#/server/admin";
import { rowActionIds } from "./row-actions";
import { runAdminAction } from "./use-admin-action";

type Props = {
  /** `null` = fechado. */
  space: Space | null;
  onClose: () => void;
  onDeleted: () => void;
};

/** Confirmação de exclusão de espaço, aberta pelo menu "Mais ações" da linha. */
export function SpaceDeleteDialog({ space, onClose, onDeleted }: Props) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Ao fechar, `space` já voltou a null; guarda o último para o texto e o foco de retorno.
  const last = useRef<Space | null>(space);
  if (space !== null) last.current = space;
  const shown = last.current;

  async function remove() {
    if (space === null) return;
    setDeleting(true);
    setError(null);
    const result = await runAdminAction(() => deleteSpaceFn({ data: { id: space.id } }));
    setDeleting(false);
    if (result.ok) onDeleted();
    else setError(result.message);
  }

  return (
    <AlertDialog
      open={space !== null}
      onOpenChange={(open) => {
        if (open) return;
        setError(null);
        onClose();
      }}
    >
      <AlertDialogContent
        onCloseAutoFocus={(event) => {
          const target =
            shown === null ? null : document.getElementById(rowActionIds(shown.id).more);
          if (target === null) return;
          event.preventDefault();
          target.focus();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle className="wrap-anywhere">Excluir {shown?.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            O espaço e os equipamentos cadastrados nele serão apagados. Espaços com reservas, aulas
            ou vínculo com o XML não podem ser excluídos.
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
  );
}
