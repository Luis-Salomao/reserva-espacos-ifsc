import { X } from "lucide-react";
import { Dialog } from "radix-ui";
import { type FormEvent, useId, useState } from "react";
import { ChoiceCard } from "#/components/ds";
import { Notice } from "#/components/page";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Textarea } from "#/components/ui/textarea";
import { EQUIPMENT, type EquipmentKind } from "#/domain/equipment";
import type { Space } from "#/domain/space";
import { createSpaceFn, updateSpaceFn } from "#/server/admin";
import type { AdminResponse } from "#/server/admin-actions";
import { FieldError } from "./field-error";
import { fieldError, generalError, runAdminAction, useFocusInvalidField } from "./use-admin-action";

type Props = {
  /** `undefined` = fechado; `null` = novo espaço; um espaço = edição. */
  space: Space | null | undefined;
  onClose: () => void;
  onSaved: () => void;
};

/** Valor de presença no formulário: "1" = sim, "0" = não, "" = não informado. */
const PRESENCE_CHOICES = [
  { value: "1", title: "Sim" },
  { value: "0", title: "Não" },
  { value: "", title: "Não informado" },
] as const;

type Values = Record<EquipmentKind, string>;

function initialValues(space: Space | null): Values {
  const items = space?.equipment?.items ?? {};
  const values = {} as Values;
  for (const item of EQUIPMENT) values[item.kind] = items[item.kind]?.toString() ?? "";
  return values;
}

/** Formato do fio: presença vai como 1, 0 ou `null`; contagem vai como o texto digitado. */
function equipmentPayload(values: Values): Record<string, number | string | null> {
  const payload: Record<string, number | string | null> = {};
  for (const item of EQUIPMENT) {
    const value = values[item.kind];
    payload[item.kind] =
      item.measure === "presence" ? (value === "" ? null : Number(value)) : value;
  }
  return payload;
}

/**
 * Diálogo de criar ou editar espaço. O formulário só existe com o diálogo aberto: fechar descarta o
 * que não foi salvo, e a próxima abertura parte dos dados gravados.
 */
export function SpaceFormDialog({ space, onClose, onSaved }: Props) {
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
            document.getElementById(`${uid}-name`)?.focus();
          }}
          className="fixed inset-x-0 bottom-0 z-50 flex max-h-[90svh] w-full flex-col overflow-hidden rounded-t-2xl border bg-surface shadow-xl sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl"
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
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

type FormProps = { uid: string; space: Space | null; onCancel: () => void; onSaved: () => void };

function SpaceForm({ uid, space, onCancel, onSaved }: FormProps) {
  const [name, setName] = useState(space?.name ?? "");
  const [capacity, setCapacity] = useState(space?.capacity?.toString() ?? "");
  const [values, setValues] = useState(() => initialValues(space));
  const [notes, setNotes] = useState(space?.equipment?.notes ?? "");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<AdminResponse<Space> | null>(null);
  useFocusInvalidField(result, uid);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    const data = { name, capacity, equipment: equipmentPayload(values), notes };
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
      <div className="flex items-start gap-3 border-b px-4 py-3">
        <div className="min-w-0 flex-1">
          <Dialog.Title className="text-base font-semibold tracking-tight">
            {space === null ? "Novo espaço" : "Editar espaço"}
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
        <div className="grid gap-2">
          <Label htmlFor={`${uid}-capacity`}>Capacidade (opcional)</Label>
          <Input
            id={`${uid}-capacity`}
            inputMode="numeric"
            value={capacity}
            onChange={(event) => setCapacity(event.target.value)}
            aria-invalid={invalid("capacity")}
            aria-describedby={describedBy("capacity")}
          />
          <FieldError id={`${uid}-capacity-error`} message={fieldError(result, "capacity")} />
        </div>
        {EQUIPMENT.map((item) =>
          item.measure === "presence" ? (
            <fieldset
              key={item.kind}
              className="grid min-w-0 gap-2"
              aria-describedby={describedBy(item.kind)}
            >
              <legend className="mb-2 text-[13px] leading-none font-semibold">{item.label}</legend>
              <div className="flex flex-wrap gap-2">
                {PRESENCE_CHOICES.map((choice, index) => (
                  <ChoiceCard
                    key={choice.value}
                    id={index === 0 ? `${uid}-${item.kind}` : undefined}
                    name={`${uid}-${item.kind}-choice`}
                    title={choice.title}
                    value={choice.value}
                    checked={values[item.kind] === choice.value}
                    onChange={() => setValues({ ...values, [item.kind]: choice.value })}
                    className="py-2.5"
                  />
                ))}
              </div>
              <FieldError
                id={`${uid}-${item.kind}-error`}
                message={fieldError(result, item.kind)}
              />
            </fieldset>
          ) : (
            <div key={item.kind} className="grid gap-2">
              <Label htmlFor={`${uid}-${item.kind}`}>{item.label} (quantidade)</Label>
              <Input
                id={`${uid}-${item.kind}`}
                inputMode="numeric"
                value={values[item.kind]}
                onChange={(event) => setValues({ ...values, [item.kind]: event.target.value })}
                aria-invalid={invalid(item.kind)}
                aria-describedby={`${uid}-${item.kind}-hint${
                  describedBy(item.kind) === undefined ? "" : ` ${uid}-${item.kind}-error`
                }`}
              />
              <p id={`${uid}-${item.kind}-hint`} className="text-[13px] text-muted-foreground">
                Vazio = não informado; 0 = não tem.
              </p>
              <FieldError
                id={`${uid}-${item.kind}-error`}
                message={fieldError(result, item.kind)}
              />
            </div>
          ),
        )}
        <div className="grid gap-2">
          <Label htmlFor={`${uid}-notes`}>Observações (opcional)</Label>
          <Textarea
            id={`${uid}-notes`}
            maxLength={500}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            aria-invalid={invalid("notes")}
            aria-describedby={describedBy("notes")}
          />
          <FieldError id={`${uid}-notes-error`} message={fieldError(result, "notes")} />
        </div>
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
