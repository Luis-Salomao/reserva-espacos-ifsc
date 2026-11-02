import { useRouter } from "@tanstack/react-router";
import { type FormEvent, useId, useState } from "react";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import type { Space } from "#/domain/space";
import { createSpaceFn, updateSpaceFn } from "#/server/admin";
import type { AdminResponse } from "#/server/admin-actions";
import { fieldError, generalError, runAdminAction } from "./use-admin-action";

type FormProps = {
  space: Space | null;
  onDone: () => void;
};

function SpaceForm({ space, onDone }: FormProps) {
  const router = useRouter();
  const uid = useId();
  const [name, setName] = useState(space?.name ?? "");
  const [capacity, setCapacity] = useState(space?.capacity?.toString() ?? "");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<AdminResponse<Space> | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    const response = await runAdminAction(() =>
      space === null
        ? createSpaceFn({ data: { name, capacity } })
        : updateSpaceFn({ data: { id: space.id, name, capacity } }),
    );
    setPending(false);
    setResult(response);
    if (response.ok) {
      if (space === null) {
        setName("");
        setCapacity("");
      }
      await router.invalidate();
      onDone();
    }
  }

  const nameError = fieldError(result, "name");
  const capacityError = fieldError(result, "capacity");
  const general = generalError(result);
  return (
    <form onSubmit={onSubmit} className="grid gap-3">
      {general !== undefined && (
        <p role="alert" className="rounded-lg border bg-occ-conflict p-3 text-sm">
          {general}
        </p>
      )}
      <div className="grid gap-2">
        <Label htmlFor={`${uid}-name`}>Nome</Label>
        <Input
          id={`${uid}-name`}
          required
          maxLength={80}
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-invalid={nameError === undefined ? undefined : true}
          aria-describedby={nameError === undefined ? undefined : `${uid}-name-error`}
        />
        {nameError !== undefined && (
          <p id={`${uid}-name-error`} className="text-sm text-destructive">
            {nameError}
          </p>
        )}
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${uid}-capacity`}>Capacidade (opcional)</Label>
        <Input
          id={`${uid}-capacity`}
          inputMode="numeric"
          value={capacity}
          onChange={(event) => setCapacity(event.target.value)}
          aria-invalid={capacityError === undefined ? undefined : true}
          aria-describedby={capacityError === undefined ? undefined : `${uid}-capacity-error`}
        />
        {capacityError !== undefined && (
          <p id={`${uid}-capacity-error`} className="text-sm text-destructive">
            {capacityError}
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Salvando…" : space === null ? "Criar espaço" : "Salvar"}
        </Button>
        {space !== null && (
          <Button type="button" size="sm" variant="outline" onClick={onDone}>
            Cancelar
          </Button>
        )}
      </div>
    </form>
  );
}

function SpaceItem({ space }: { space: Space }) {
  const [editing, setEditing] = useState(false);
  return (
    <li className="rounded-lg border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="break-words font-medium">{space.name}</p>
          <p className="text-sm text-muted-foreground">
            {space.capacity === null ? "Capacidade não informada" : `${space.capacity} lugares`}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-expanded={editing}
          onClick={() => setEditing(!editing)}
        >
          Editar
        </Button>
      </div>
      {editing && (
        <div className="mt-3 border-t pt-3">
          <SpaceForm space={space} onDone={() => setEditing(false)} />
        </div>
      )}
    </li>
  );
}

export function SpacesManager({ spaces }: { spaces: Space[] }) {
  return (
    <div className="grid gap-6">
      <section aria-labelledby="new-space-title" className="rounded-lg border bg-surface p-4">
        <h2 id="new-space-title" className="mb-3 text-xl font-semibold">
          Novo espaço
        </h2>
        <SpaceForm space={null} onDone={() => {}} />
      </section>
      <section aria-labelledby="spaces-title" className="grid gap-3">
        <h2 id="spaces-title" className="text-xl font-semibold">
          Espaços ({spaces.length})
        </h2>
        {spaces.length === 0 ? (
          <p className="rounded-lg border bg-surface p-6 text-center text-muted-foreground">
            Nenhum espaço cadastrado
          </p>
        ) : (
          <ul className="grid gap-3">
            {spaces.map((space) => (
              <SpaceItem key={space.id} space={space} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
