import { DoorOpen, Plus } from "lucide-react";
import type { RoomDay } from "#/application/bookings";
import { Button } from "#/components/ui/button";
import type { TimeRange } from "#/domain/availability";
import { blockOf, isFreeIn } from "#/domain/room-filter";

type Slot = { spaceId: string; date: string; start: string; end: string };

type Props = {
  /** Salas que já passaram nos filtros de bloco, capacidade e busca. */
  rooms: readonly RoomDay[];
  window: TimeRange;
  now: string;
  canBook: boolean;
  onBook: (slot: Slot) => void;
  onClearFilters: () => void;
};

function capacityLabel(capacity: number | null): string {
  if (capacity === null) return "Capacidade não cadastrada";
  return capacity === 1 ? "1 lugar" : `${capacity} lugares`;
}

/** Salas inteiramente livres na janela (trecho passado de hoje conta como ocupado). */
export function RoomsFreeList({ rooms, window, now, canBook, onBook, onClearFilters }: Props) {
  const free = rooms.filter((room) => isFreeIn(room, window, now));
  if (free.length === 0) {
    return (
      <div className="grid justify-items-center gap-3 rounded-2xl border border-dashed border-border p-10 text-center">
        <DoorOpen className="size-10 text-muted-foreground/60" aria-hidden="true" />
        <p className="font-semibold text-foreground">Nenhuma sala com esses filtros</p>
        <Button type="button" variant="outline" onClick={onClearFilters}>
          Limpar filtros
        </Button>
      </div>
    );
  }
  return (
    <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" aria-label="Salas livres">
      {free.map((room) => {
        const block = blockOf(room.space.name);
        return (
          <li
            key={room.spaceId}
            className="flex min-w-0 items-center gap-3 rounded-xl border border-border bg-surface p-3"
          >
            <div className="grid min-w-0 flex-1 gap-0.5">
              <h3 className="truncate text-[15px] font-semibold tracking-tight">
                {room.space.name}
              </h3>
              <p className="truncate text-[13px] text-muted-foreground">
                {block === null ? "Outros espaços" : `Bloco ${block}`} ·{" "}
                {capacityLabel(room.space.capacity)}
              </p>
            </div>
            {canBook && (
              <Button
                type="button"
                size="sm"
                aria-label={`Reservar ${room.space.name}, ${window.start}–${window.end}`}
                onClick={() =>
                  onBook({
                    spaceId: room.spaceId,
                    date: room.date,
                    start: window.start,
                    end: window.end,
                  })
                }
              >
                <Plus aria-hidden="true" />
                Reservar
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
