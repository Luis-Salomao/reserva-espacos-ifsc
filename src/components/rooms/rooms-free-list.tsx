import { Link } from "@tanstack/react-router";
import { DoorOpen, Plus } from "lucide-react";
import type { RoomDay } from "#/application/bookings";
import { Button } from "#/components/ui/button";
import type { TimeRange } from "#/domain/availability";
import { availabilityIn, blockOf, busyReasonText } from "#/domain/room-filter";

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

function RoomHeader({ room }: { room: RoomDay }) {
  const block = blockOf(room.space.name);
  return (
    <>
      <h3 className="truncate text-[15px] font-semibold tracking-tight">
        <Link
          to="/"
          search={{ espaco: room.spaceId, data: room.date }}
          className="rounded-sm underline-offset-4 hover:underline"
          title={`Abrir a agenda de ${room.space.name}`}
        >
          {room.space.name}
        </Link>
      </h3>
      <p className="truncate text-[13px] text-muted-foreground">
        {block === null ? "Outros espaços" : `Bloco ${block}`} ·{" "}
        {capacityLabel(room.space.capacity)}
      </p>
    </>
  );
}

const ITEM = "flex min-w-0 items-center gap-3 rounded-xl border border-border bg-surface p-3";

/**
 * Salas inteiramente livres na janela (trecho passado de hoje conta como ocupado) e, abaixo do
 * título "Ocupadas", as outras com o motivo: o que ocupa e o horário, sem pessoas.
 */
export function RoomsFreeList({ rooms, window, now, canBook, onBook, onClearFilters }: Props) {
  if (rooms.length === 0) {
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
  const { free, busy } = availabilityIn(rooms, window, now);
  return (
    <div className="grid gap-4">
      {free.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-4 text-center font-semibold text-foreground">
          Nenhuma sala livre nessa janela
        </p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" aria-label="Salas livres">
          {free.map((room) => (
            <li key={room.spaceId} className={ITEM}>
              <div className="grid min-w-0 flex-1 gap-0.5">
                <RoomHeader room={room} />
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
          ))}
        </ul>
      )}
      {busy.length > 0 && (
        <section className="grid gap-2" aria-labelledby="salas-ocupadas">
          <h2 id="salas-ocupadas" className="text-[13px] font-semibold text-muted-foreground">
            Ocupadas
          </h2>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" aria-label="Salas ocupadas">
            {busy.map(({ room, reasons }) => (
              <li key={room.spaceId} className={`${ITEM} opacity-80`}>
                <div className="grid min-w-0 flex-1 gap-0.5">
                  <RoomHeader room={room} />
                  {reasons.map((reason) => (
                    <p
                      key={busyReasonText(reason)}
                      className="truncate text-[13px] text-foreground"
                    >
                      {busyReasonText(reason)}
                    </p>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
