import { type FormEvent, useId, useState } from "react";
import { Notice } from "#/components/page";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import type { Space } from "#/domain/space";
import { createSpaceFn, updateSpaceFn } from "#/server/admin";
import type { AdminResponse } from "#/server/admin-actions";
import { AdminDialog } from "./admin-dialog";
import { FieldError } from "./field-error";
import { initialSpaceInfoValues, SpaceInfoFields, spaceInfoPayload } from "./space-info-fields";
import { fieldError, generalError, runAdminAction, useFocusInvalidField } from "./use-admin-action";

type Props = {
  /** `undefined` = fechado; `null` = novo espaço; um espaço = edição. */
  space: Space | null | undefined;
  onClose: () => void;
  onSaved: () => void;
  /** Id do botão que recebe o foco ao fechar (o lápis da linha ou "Novo espaço"). */
  returnFocusId?: string | undefined;
};

/**
 * Diálogo de criar ou editar espaço. O formulário só existe com o diálogo aberto: fechar descarta o
 * que não foi salvo, e a próxima abertura parte dos dados gravados.
 */
export function SpaceFormDialog({ space, onClose, onSaved, returnFocusId }: Props) {
  const uid = useId();
  return (
    <AdminDialog
      open={space !== undefined}
      title={space === null ? "Novo espaço" : "Editar espaço"}
      description='Deixe em branco ou em "Não informado" o que não souber.'
      onClose={onClose}
      returnFocusId={returnFocusId}
    >
      {space !== undefined && (
        <SpaceForm
          key={space?.id ?? "novo"}
          uid={uid}
          space={space}
          onCancel={onClose}
          onSaved={onSaved}
        />
      )}
    </AdminDialog>
  );
}

type FormProps = { uid: string; space: Space | null; onCancel: () => void; onSaved: () => void };

function SpaceForm({ uid, space, onCancel, onSaved }: FormProps) {
  const [name, setName] = useState(space?.name ?? "");
  const [values, setValues] = useState(() => initialSpaceInfoValues(space));
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<AdminResponse<Space> | null>(null);
  useFocusInvalidField(result, uid);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    const data = { name, ...spaceInfoPayload(values) };
    const response = await runAdminAction(() =>
      space === null ? createSpaceFn({ data }) : updateSpaceFn({ data: { id: space.id, ...data } }),
    );
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
      <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto overscroll-contain p-4">
        {general !== undefined && (
          <Notice tone="error" role="alert">
            {general}
          </Notice>
        )}
        <div className="grid gap-2">
          <Label htmlFor={`${uid}-name`}>Nome</Label>
          <Input
            id={`${uid}-name`}
            required
            maxLength={80}
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-invalid={invalid("name")}
            aria-describedby={describedBy("name")}
          />
          <FieldError id={`${uid}-name-error`} message={fieldError(result, "name")} />
        </div>
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
