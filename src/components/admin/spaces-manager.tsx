import { useRouter } from "@tanstack/react-router";
import { Plus, Search } from "lucide-react";
import { useId, useState } from "react";
import { matchesRoomSearch } from "#/components/agenda/room-search";
import { EquipmentMarks } from "#/components/equipment-marks";
import { Callout, Notice } from "#/components/page";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import type { Space } from "#/domain/space";
import { groupSpaces } from "#/domain/space-groups";
import { AdminTable, type Column } from "./admin-table";
import { RowActions, rowActionIds } from "./row-actions";
import { SpaceDeleteDialog } from "./space-delete-dialog";
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

type SpaceRow = { space: Space; floor: string };

function maintenanceText(space: Space): string | null {
  const count = space.equipment?.computersInMaintenance ?? null;
  if (count === null || count <= 0) return null;
  return count === 1 ? "1 computador" : `${count} computadores`;
}

const NEW_SPACE_BUTTON_ID = "admin-new-space";

function spaceColumns(
  onEdit: (space: Space) => void,
  onDelete: (space: Space) => void,
): Column<SpaceRow>[] {
  return [
    {
      key: "name",
      header: "Nome da sala",
      headerClassName: "md:w-[22%]",
      cell: ({ space }) => (
        <span className="block font-medium wrap-anywhere md:truncate" title={space.name}>
          {space.name}
        </span>
      ),
    },
    {
      key: "floor",
      header: "Andar",
      headerClassName: "md:w-[9%]",
      cellClassName: "max-md:hidden",
      cell: ({ floor }) => floor,
    },
    {
      key: "capacity",
      header: "Capacidade",
      headerClassName: "md:w-[14%]",
      cellClassName: "text-muted-foreground md:text-foreground",
      cell: ({ space }) => (
        <>
          <span className="md:hidden">Capacidade: </span>
          {space.capacity === null ? "Não informada" : `${space.capacity} lugares`}
        </>
      ),
    },
    {
      key: "equipment",
      header: "Equipamentos",
      headerClassName: "md:w-[13%]",
      cellClassName: "mt-1 md:mt-0",
      cell: ({ space }) => <EquipmentMarks equipment={space.equipment} />,
    },
    {
      key: "maintenance",
      header: "Computadores em manutenção",
      headerClassName: "md:w-[12%]",
      cellClassName: ({ space }) => (maintenanceText(space) === null ? "max-md:hidden" : ""),
      cell: ({ space }) => {
        const text = maintenanceText(space);
        return text === null ? (
          <span aria-hidden="true">—</span>
        ) : (
          <>
            <span className="text-muted-foreground md:hidden">Em manutenção: </span>
            {text}
          </>
        );
      },
    },
    {
      key: "notes",
      header: "Observações",
      headerClassName: "md:w-[18%]",
      cellClassName: ({ space }) => (space.equipment?.notes ? "" : "max-md:hidden"),
      cell: ({ space }) => {
        const notes = space.equipment?.notes ?? null;
        if (notes === null || notes === "") return <span aria-hidden="true">—</span>;
        return (
          <span
            className="line-clamp-2 text-muted-foreground wrap-anywhere md:block md:truncate"
            title={notes}
          >
            {notes}
          </span>
        );
      },
    },
    {
      key: "actions",
      header: "Ações",
      headerClassName: "text-right md:w-24",
      cellClassName: "col-start-2 row-start-1 row-span-5 self-start md:self-auto",
      cell: ({ space }) => (
        <RowActions
          rowId={space.id}
          name={space.name}
          onEdit={() => onEdit(space)}
          actions={[{ label: "Excluir", onSelect: () => onDelete(space) }]}
        />
      ),
    },
  ];
}

export function SpacesManager({ spaces }: { spaces: Space[] }) {
  const router = useRouter();
  const uid = useId();
  const [query, setQuery] = useState("");
  /** `undefined` = diálogo fechado; `null` = novo espaço. */
  const [editing, setEditing] = useState<Space | null | undefined>(undefined);
  const [status, setStatus] = useState("");
  /** Espaço cuja exclusão está sendo confirmada. */
  const [deleting, setDeleting] = useState<Space | null>(null);
  /** Botão que recebe o foco quando o diálogo de edição fecha. */
  const [returnId, setReturnId] = useState(NEW_SPACE_BUTTON_ID);
  function openEditor(space: Space | null) {
    setReturnId(space === null ? NEW_SPACE_BUTTON_ID : rowActionIds(space.id).edit);
    setEditing(space);
  }
  const columns = spaceColumns(openEditor, setDeleting);

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
        <Button type="button" id={NEW_SPACE_BUTTON_ID} onClick={() => openEditor(null)}>
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
          <Button type="button" size="sm" variant="outline" onClick={() => openEditor(null)}>
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
            <AdminTable
              caption={`Espaços do ${block.label}`}
              rows={block.floors.flatMap((floor) =>
                floor.spaces.map((space) => ({ space, floor: floor.label })),
              )}
              columns={columns}
              rowKey={(row) => row.space.id}
            />
          </section>
        ))
      )}
      <SpaceDeleteDialog
        space={deleting}
        onClose={() => setDeleting(null)}
        onDeleted={() => {
          setDeleting(null);
          void reload("Espaço excluído.");
        }}
      />
      <SpaceFormDialog
        space={editing}
        returnFocusId={returnId}
        onClose={() => setEditing(undefined)}
        onSaved={() => {
          setEditing(undefined);
          void reload("Espaço salvo.");
        }}
      />
    </div>
  );
}
