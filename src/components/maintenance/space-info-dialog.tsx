import { X } from "lucide-react";
import { Dialog } from "radix-ui";
import { type FormEvent, useId, useState } from "react";
import {
  initialSpaceInfoValues,
  SpaceInfoFields,
  spaceInfoPayload,
} from "#/components/admin/space-info-fields";
import {
  fieldError,
  generalError,
  runAdminAction,
  useFocusInvalidField,
} from "#/components/admin/use-admin-action";
import { Notice } from "#/components/page";
import { Button } from "#/components/ui/button";
import type { Space } from "#/domain/space";
import { updateSpaceInfoFn } from "#/server/admin";
import type { AdminResponse } from "#/server/admin-actions";

type Props = {
  /** `undefined` = fechado; um espaço = edição (não há criação nesta tela). */
  space: Space | undefined;
  onClose: () => void;
  onSaved: () => void;
};

/**
 * Diálogo de atualização restrita de um espaço (capacidade, equipamentos, computadores em
 * manutenção e observações), para `admin` ou `manutencao`. Não altera o nome do espaço.
 */
export function SpaceInfoDialog({ space, onClose, onSaved }: Props) {
  const uid = useId();
  return (
    <Dialog.Root
      open={space !== undefined}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
        <Dialog.Content
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            document.getElementById(`${uid}-capacity`)?.focus();
          }}
          className="fixed inset-x-0 bottom-0 z-50 flex max-h-[90svh] w-full flex-col overflow-hidden rounded-t-2xl border bg-surface shadow-xl sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl"
        >
          {space !== undefined && (
            <SpaceInfoForm
              key={space.id}
              uid={uid}
              space={space}
              onCancel={onClose}
              onSaved={onSaved}
            />
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

type FormProps = { uid: string; space: Space; onCancel: () => void; onSaved: () => void };

function SpaceInfoForm({ uid, space, onCancel, onSaved }: FormProps) {
  const [values, setValues] = useState(() => initialSpaceInfoValues(space));
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<AdminResponse<Space> | null>(null);
  useFocusInvalidField(result, uid);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    const data = { spaceId: space.id, ...spaceInfoPayload(values) };
    const response = await runAdminAction(() => updateSpaceInfoFn({ data }));
    setPending(false);
    setResult(response);
    if (response.ok) onSaved();
  }

  const general = generalError(result);
  const describedBy = (field: string) =>
    fieldError(result, field) === undefined ? undefined : `${uid}-${field}-error`;
  const invalid = (field: string) => (fieldError(result, field) === undefined ? undefined : true);

  return (
    <form onSubmit={onSubmit} className="flex min-h-0 flex-col">
      <div className="flex items-start gap-3 border-b px-4 py-3">
        <div className="min-w-0 flex-1">
          <Dialog.Title className="text-base font-semibold tracking-tight wrap-anywhere">
            Atualizar {space.name}
          </Dialog.Title>
          <Dialog.Description className="text-sm text-muted-foreground">
            Deixe em branco ou em "Não informado" o que não souber.
          </Dialog.Description>
        </div>
        <Dialog.Close asChild>
          <Button type="button" variant="ghost" size="icon" aria-label="Fechar">
            <X className="size-4" aria-hidden="true" />
          </Button>
        </Dialog.Close>
      </div>
      <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto overscroll-contain p-4">
        {general !== undefined && (
          <Notice tone="error" role="alert">
            {general}
          </Notice>
        )}
        <SpaceInfoFields
          uid={uid}
          values={values}
          onChange={setValues}
          result={result}
          describedBy={describedBy}
          invalid={invalid}
        />
      </div>
      <div className="flex flex-wrap justify-end gap-2 border-t px-4 py-3">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando…" : "Salvar"}
        </Button>
      </div>
    </form>
  );
}
