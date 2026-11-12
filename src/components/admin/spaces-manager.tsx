import { useRouter } from "@tanstack/react-router";
import { Plus, Search } from "lucide-react";
import { useId, useState } from "react";
import { matchesRoomSearch } from "#/components/agenda/room-search";
import { Callout, Notice } from "#/components/page";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import type { Space } from "#/domain/space";
import { groupSpaces } from "#/domain/space-groups";
import { SpaceCard } from "./space-card";
import { SpaceFormDialog } from "./space-form-dialog";

/** Falha ao carregar a lista, com nova tentativa. */
export function SpacesLoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <Callout tone="error" role="alert" className="grid justify-items-start gap-2">
      <p className="font-medium">Não foi possível carregar os espaços.</p>
      <Button type="button" size="sm" variant="outline" onClick={onRetry}>
        Tentar de novo
      </Button>
    </Callout>
  );
}

export function SpacesManager({ spaces }: { spaces: Space[] }) {
  const router = useRouter();
  const uid = useId();
  const [query, setQuery] = useState("");
  /** `undefined` = diálogo fechado; `null` = novo espaço. */
  const [editing, setEditing] = useState<Space | null | undefined>(undefined);
  const [status, setStatus] = useState("");

  async function reload(message: string) {
    setStatus("");
    await router.invalidate();
    setStatus(message);
  }

  const visible = spaces.filter((space) => matchesRoomSearch(space.name, query));
  const groups = groupSpaces(visible);
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-56">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            aria-label="Buscar espaço"
            placeholder="Buscar sala ou bloco..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-describedby={`${uid}-count`}
            className="pl-9"
          />
        </div>
        <Button type="button" onClick={() => setEditing(null)}>
          <Plus className="size-4" aria-hidden="true" />
          Novo espaço
        </Button>
      </div>
      <p id={`${uid}-count`} className="text-sm text-muted-foreground">
        {visible.length} de {spaces.length} espaços
      </p>
      <div role="status">{status !== "" && <Notice tone="ok">{status}</Notice>}</div>
      {spaces.length === 0 ? (
        <Callout className="grid justify-items-center gap-2 p-6 text-center text-muted-foreground">
          <p>Nenhum espaço cadastrado.</p>
          <Button type="button" size="sm" variant="outline" onClick={() => setEditing(null)}>
            Cadastrar espaço
          </Button>
        </Callout>
      ) : visible.length === 0 ? (
        <Callout className="grid justify-items-center gap-2 p-6 text-center text-muted-foreground">
          <p>Nenhum espaço encontrado.</p>
          <Button type="button" size="sm" variant="outline" onClick={() => setQuery("")}>
            Limpar busca
          </Button>
        </Callout>
      ) : (
        groups.map((block) => (
          <section key={block.label} aria-label={block.label} className="grid min-w-0 gap-2">
            <h2 className="text-lg font-semibold tracking-tight">{block.label}</h2>
            {block.floors.map((floor) => (
              <div key={floor.label} className="grid min-w-0 gap-1.5">
                <h3 className="text-sm font-medium text-muted-foreground">{floor.label}</h3>
                <ul className="grid gap-3 md:grid-cols-2">
                  {floor.spaces.map((space) => (
                    <SpaceCard
                      key={space.id}
                      space={space}
                      onEdit={() => setEditing(space)}
                      onDeleted={() => void reload("Espaço excluído.")}
                    />
                  ))}
                </ul>
              </div>
            ))}
          </section>
        ))
      )}
      <SpaceFormDialog
        space={editing}
        onClose={() => setEditing(undefined)}
        onSaved={() => {
          setEditing(undefined);
          void reload("Espaço salvo.");
        }}
      />
    </div>
  );
}
