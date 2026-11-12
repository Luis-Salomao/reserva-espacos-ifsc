import { Building2, Check, ChevronsUpDown, LayoutGrid, Search, X } from "lucide-react";
import { Dialog } from "radix-ui";
import { useId, useState } from "react";
import { EquipmentMarks } from "#/components/equipment-marks";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { blockOf } from "#/domain/room-filter";
import type { Space } from "#/domain/space";
import { cn } from "#/lib/utils";
import { matchesRoomSearch } from "./room-search";

export type RoomSelectorProps = {
  spaces: Space[];
  selectedSpaceId: string;
  onSelectSpace: (spaceId: string) => void;
  variant: "vertical" | "chips";
  /** Abre a tela com todas as salas; sem ela, o atalho não aparece. */
  onSeeAllRooms?: () => void;
  /** Observações livres. Visitante não as vê. */
  showNotes?: boolean;
};

export function RoomSelector({
  spaces,
  selectedSpaceId,
  onSelectSpace,
  variant,
  onSeeAllRooms,
  showNotes = false,
}: RoomSelectorProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const id = useId();
  const selected = spaces.find((space) => space.id === selectedSpaceId);
  const groups = new Map<string, Space[]>();
  for (const space of spaces) {
    const block = blockOf(space.name);
    const group = block ? `Bloco ${block}` : "Outros espaços";
    if (!matchesRoomSearch(space.name, query)) continue;
    const rooms = groups.get(group) ?? [];
    rooms.push(space);
    groups.set(group, rooms);
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (!value) setQuery("");
      }}
    >
      <Dialog.Trigger asChild>
        <Button
          variant="outline"
          aria-label={`Escolher sala: ${selected?.name ?? "nenhuma selecionada"}`}
          className={cn(
            "h-10 min-w-0 justify-start gap-2",
            variant === "vertical"
              ? "w-full"
              : "w-full border-primary bg-primary/10 font-semibold text-foreground hover:bg-primary/20 sm:max-w-sm",
          )}
          disabled={spaces.length === 0}
        >
          <Building2 className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="truncate">{selected?.name ?? "Escolher sala"}</span>
          <ChevronsUpDown
            className="ml-auto size-3.5 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 flex max-h-[80svh] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border bg-surface shadow-xl">
          <div className="flex items-center gap-3 px-4 pt-4">
            <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-surface-2">
              <Building2 className="size-5 text-muted-foreground" aria-hidden="true" />
            </span>
            <div className="flex-1">
              <Dialog.Title className="text-base font-semibold tracking-tight">
                Escolher sala
              </Dialog.Title>
              <Dialog.Description className="text-sm text-muted-foreground">
                Salas por bloco e andar.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Fechar seletor de salas">
                <X className="size-4" aria-hidden="true" />
              </Button>
            </Dialog.Close>
          </div>
          <div className="relative border-b p-4">
            <Search
              className="pointer-events-none absolute top-7 left-7 size-4 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              aria-label="Buscar sala ou bloco"
              placeholder="Buscar sala ou bloco..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="pl-9"
              aria-describedby={`${id}-count`}
            />
          </div>
          <div className="grid min-h-0 flex-1 grid-cols-1 items-start gap-4 overflow-y-auto overscroll-contain p-4 sm:grid-cols-2">
            {[...groups]
              .sort(([a], [b]) => a.localeCompare(b, "pt-BR", { numeric: true }))
              .map(([group, rooms]) => {
                const floors = new Map<string, Space[]>();
                for (const room of rooms) {
                  const code = /(?:^|\s)[A-Z]\s*[-.]?\s*(\d{3})(?!\d)/i.exec(room.name)?.[1];
                  const floor = code ? `Andar ${code[0]}` : "Sem andar identificado";
                  const entries = floors.get(floor) ?? [];
                  entries.push(room);
                  floors.set(floor, entries);
                }
                return (
                  <fieldset key={group} className="min-w-0 rounded-xl border bg-background p-3">
                    <legend className="flex items-center gap-2 px-1 text-sm font-semibold">
                      <Building2 className="size-4 text-muted-foreground" aria-hidden="true" />{" "}
                      {group}
                    </legend>
                    {[...floors]
                      .sort(([a], [b]) => a.localeCompare(b, "pt-BR", { numeric: true }))
                      .map(([floor, entries]) => (
                        <fieldset key={floor} className="mt-3 min-w-0 first:mt-1">
                          <legend className="mb-2 text-[11px] font-medium text-muted-foreground">
                            {floor}
                          </legend>
                          <div className="grid grid-cols-2 gap-1.5">
                            {entries
                              .sort((a, b) =>
                                a.name.localeCompare(b.name, "pt-BR", { numeric: true }),
                              )
                              .map((space) => (
                                <button
                                  key={space.id}
                                  type="button"
                                  aria-pressed={space.id === selectedSpaceId}
                                  onClick={() => {
                                    onSelectSpace(space.id);
                                    setOpen(false);
                                    setQuery("");
                                  }}
                                  className={cn(
                                    "relative flex min-h-11 w-full flex-col items-start justify-center rounded-md border px-2 py-2 pr-6 text-left text-xs transition-colors hover:border-primary/50 hover:bg-surface-2",
                                    space.id === selectedSpaceId &&
                                      "border-primary bg-primary/5 font-medium",
                                  )}
                                >
                                  <span className="min-w-0 break-words">{space.name}</span>
                                  <EquipmentMarks
                                    equipment={space.equipment}
                                    showNotes={showNotes}
                                  />
                                  {space.capacity !== null && (
                                    <span className="mt-0.5 text-[10px] text-muted-foreground">
                                      {space.capacity} lugares
                                    </span>
                                  )}
                                  {space.id === selectedSpaceId && (
                                    <Check
                                      className="absolute top-2.5 right-1.5 size-3.5 text-primary"
                                      aria-hidden="true"
                                    />
                                  )}
                                </button>
                              ))}
                          </div>
                        </fieldset>
                      ))}
                  </fieldset>
                );
              })}
            {groups.size === 0 && (
              <p className="col-span-full py-4 text-center text-sm text-muted-foreground">
                Nenhuma sala encontrada.
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 border-t px-4 py-2">
            <p id={`${id}-count`} role="status" className="text-xs text-muted-foreground">
              {[...groups.values()].reduce((total, rooms) => total + rooms.length, 0)} de{" "}
              {spaces.length} espaços
            </p>
            {onSeeAllRooms && (
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto h-8 gap-1.5 text-primary"
                onClick={() => {
                  setOpen(false);
                  setQuery("");
                  onSeeAllRooms();
                }}
              >
                <LayoutGrid className="size-3.5" aria-hidden="true" />
                Ver todas as salas
              </Button>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
