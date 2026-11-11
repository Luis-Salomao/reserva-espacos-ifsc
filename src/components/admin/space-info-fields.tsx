import { ChoiceCard } from "#/components/ds";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Textarea } from "#/components/ui/textarea";
import { EQUIPMENT, type EquipmentKind } from "#/domain/equipment";
import type { Space } from "#/domain/space";
import type { AdminResponse } from "#/server/admin-actions";
import { FieldError } from "./field-error";
import { fieldError } from "./use-admin-action";

/** Valor de presença no formulário: "1" = sim, "0" = não, "" = não informado. */
const PRESENCE_CHOICES = [
  { value: "1", title: "Sim" },
  { value: "0", title: "Não" },
  { value: "", title: "Não informado" },
] as const;

type EquipmentValues = Record<EquipmentKind, string>;

/** Capacidade, equipamentos, computadores em manutenção e observações: comuns às duas telas. */
export type SpaceInfoValues = {
  capacity: string;
  equipment: EquipmentValues;
  computersInMaintenance: string;
  notes: string;
};

export function initialSpaceInfoValues(space: Space | null): SpaceInfoValues {
  const items = space?.equipment?.items ?? {};
  const equipment = {} as EquipmentValues;
  for (const item of EQUIPMENT) equipment[item.kind] = items[item.kind]?.toString() ?? "";
  const inMaintenance = space?.equipment?.computersInMaintenance;
  return {
    capacity: space?.capacity?.toString() ?? "",
    equipment,
    computersInMaintenance:
      inMaintenance === null || inMaintenance === undefined ? "" : inMaintenance.toString(),
    notes: space?.equipment?.notes ?? "",
  };
}

/** Formato do fio: presença vai como 1, 0 ou `null`; contagem vai como o texto digitado. */
function equipmentPayload(values: EquipmentValues): Record<string, number | string | null> {
  const payload: Record<string, number | string | null> = {};
  for (const item of EQUIPMENT) {
    const value = values[item.kind];
    payload[item.kind] =
      item.measure === "presence" ? (value === "" ? null : Number(value)) : value;
  }
  return payload;
}

/** Monta o corpo comum (`capacity`, `equipment`, `computersInMaintenance`, `notes`) para o fio. */
export function spaceInfoPayload(values: SpaceInfoValues): {
  capacity: string;
  equipment: Record<string, number | string | null>;
  computersInMaintenance: string | null;
  notes: string;
} {
  return {
    capacity: values.capacity,
    equipment: equipmentPayload(values.equipment),
    computersInMaintenance:
      values.computersInMaintenance === "" ? null : values.computersInMaintenance,
    notes: values.notes,
  };
}

type Props = {
  uid: string;
  values: SpaceInfoValues;
  onChange: (values: SpaceInfoValues) => void;
  result: AdminResponse<unknown> | null;
  describedBy: (field: string) => string | undefined;
  invalid: (field: string) => true | undefined;
};

/**
 * Campos compartilhados entre o formulário administrativo de espaço e o de manutenção:
 * capacidade, equipamentos, computadores em manutenção e observações.
 */
export function SpaceInfoFields({ uid, values, onChange, result, describedBy, invalid }: Props) {
  return (
    <>
      <div className="grid gap-2">
        <Label htmlFor={`${uid}-capacity`}>Capacidade (opcional)</Label>
        <Input
          id={`${uid}-capacity`}
          inputMode="numeric"
          value={values.capacity}
          onChange={(event) => onChange({ ...values, capacity: event.target.value })}
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
                  checked={values.equipment[item.kind] === choice.value}
                  onChange={() =>
                    onChange({
                      ...values,
                      equipment: { ...values.equipment, [item.kind]: choice.value },
                    })
                  }
                  className="py-2.5"
                />
              ))}
            </div>
            <FieldError id={`${uid}-${item.kind}-error`} message={fieldError(result, item.kind)} />
          </fieldset>
        ) : (
          <div key={item.kind} className="grid gap-2">
            <Label htmlFor={`${uid}-${item.kind}`}>{item.label} (quantidade)</Label>
            <Input
              id={`${uid}-${item.kind}`}
              inputMode="numeric"
              value={values.equipment[item.kind]}
              onChange={(event) =>
                onChange({
                  ...values,
                  equipment: { ...values.equipment, [item.kind]: event.target.value },
                })
              }
              aria-invalid={invalid(item.kind)}
              aria-describedby={`${uid}-${item.kind}-hint${
                describedBy(item.kind) === undefined ? "" : ` ${uid}-${item.kind}-error`
              }`}
            />
            <p id={`${uid}-${item.kind}-hint`} className="text-[13px] text-muted-foreground">
              Vazio = não informado; 0 = não tem.
            </p>
            <FieldError id={`${uid}-${item.kind}-error`} message={fieldError(result, item.kind)} />
          </div>
        ),
      )}
      <div className="grid gap-2">
        <Label htmlFor={`${uid}-computersInMaintenance`}>Computadores em manutenção</Label>
        <Input
          id={`${uid}-computersInMaintenance`}
          inputMode="numeric"
          value={values.computersInMaintenance}
          onChange={(event) => onChange({ ...values, computersInMaintenance: event.target.value })}
          aria-invalid={invalid("computersInMaintenance")}
          aria-describedby={`${uid}-computersInMaintenance-hint${
            describedBy("computersInMaintenance") === undefined
              ? ""
              : ` ${uid}-computersInMaintenance-error`
          }`}
        />
        <p id={`${uid}-computersInMaintenance-hint`} className="text-[13px] text-muted-foreground">
          Vazio = não informado; não pode passar do total de computadores.
        </p>
        <FieldError
          id={`${uid}-computersInMaintenance-error`}
          message={fieldError(result, "computersInMaintenance")}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${uid}-notes`}>Observações (opcional)</Label>
        <Textarea
          id={`${uid}-notes`}
          maxLength={500}
          value={values.notes}
          onChange={(event) => onChange({ ...values, notes: event.target.value })}
          aria-invalid={invalid("notes")}
          aria-describedby={`${uid}-notes-hint${
            describedBy("notes") === undefined ? "" : ` ${uid}-notes-error`
          }`}
        />
        <p id={`${uid}-notes-hint`} className="text-[13px] text-muted-foreground">
          Visível para qualquer pessoa na consulta.
        </p>
        <FieldError id={`${uid}-notes-error`} message={fieldError(result, "notes")} />
      </div>
    </>
  );
}
