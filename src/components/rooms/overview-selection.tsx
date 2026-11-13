import { Plus, X } from "lucide-react";
import { type Ref, useState } from "react";
import type { RoomsRange } from "#/application/bookings";
import { EquipmentMarks } from "#/components/equipment-marks";
import { Button } from "#/components/ui/button";
import type { TimeRange } from "#/domain/availability";
import { roomsOnDay } from "#/domain/overview";
import {
  availabilityIn,
  blockOf,
  blocksOf,
  busyReasonText,
  filterRooms,
  floorOf,
  floorsOf,
  type RoomFilter,
  windowIssue,
} from "#/domain/room-filter";
import { cn } from "#/lib/utils";
import { dayLabel } from "./overview-cell";
import { PlaceChips, WindowFields } from "./rooms-filters";

/** Trecho escolhido na visão geral: dia, horário e a sala da linha onde a seleção começou. */
export type OverviewPick = TimeRange & {
  date: string;
  suggested: string | null;
  /** Quadrados clicados ou arrastados (índices dos blocos do dia); some se o horário for ajustado no painel. */
  origin?: { from: number; to: number };
};

type Props = {
  selection: OverviewPick;
  /** Salas que passaram nos filtros da página. */
  rooms: RoomsRange["rooms"];
  now: string;
  /** Pode reservar ou é visitante (que recebe o convite para entrar). */
  canReserve: boolean;
  /** Observações livres. Visitante não as vê. */
  showNotes?: boolean;
  onRangeChange: (range: TimeRange) => void;
  onClose: () => void;
  onBook: (slot: { spaceId: string; date: string; start: string; end: string }) => void;
  className?: string;
  ref?: Ref<HTMLElement>;
};

function placeLabel(name: string): string {
  const block = blockOf(name);
  const floor = floorOf(name);
  if (block === null) return "Outros espaços";
  return floor === null ? `Bloco ${block}` : `Bloco ${block} · Andar ${floor}`;
}

const ITEM = "grid min-w-0 gap-0.5 rounded-lg border border-border bg-background p-2";

/**
 * Painel do trecho selecionado: dia e horário ajustáveis, filtros de bloco e andar e as salas
 * livres (a sugerida primeiro) antes das ocupadas com o motivo, sem pessoas.
 */
export function OverviewSelection({
  selection,
  rooms,
  now,
  canReserve,
  showNotes = false,
  onRangeChange,
  onClose,
  onBook,
  className,
  ref,
}: Props) {
  const [places, setPlaces] = useState<Pick<RoomFilter, "blocks" | "floors">>({
    blocks: [],
    floors: [],
  });
  const { date, start, end, suggested } = selection;
  const range = { start, end };
  const day = roomsOnDay(rooms, date);
  const filter: RoomFilter = {
    ...places,
    minCapacity: null,
    withProjector: false,
    minComputers: null,
    query: "",
    onlyFree: false,
    window: range,
  };
  const valid = windowIssue(range) === null;
  const ended = `${date}T${end}` <= now;
  const { free, busy } = availabilityIn(filterRooms(day, filter, now).rooms, range, now);
  const ordered = [
    ...free.filter((room) => room.spaceId === suggested),
    ...free.filter((room) => room.spaceId !== suggested),
  ];
  const change = (next: RoomFilter) => {
    setPlaces({ blocks: next.blocks, floors: next.floors });
    if (next.window.start !== start || next.window.end !== end) onRangeChange(next.window);
  };

  return (
    <section
      ref={ref}
      aria-label="Horário selecionado"
      className={cn(
        "grid content-start gap-3 rounded-xl border border-border bg-surface p-3",
        className,
      )}
    >
      <div className="flex items-start gap-2">
        <h2 className="flex-1 text-[14px] font-semibold text-foreground first-letter:uppercase">
          {`${dayLabel(date)} · ${start}–${end}`}
        </h2>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label="Fechar seleção"
          onClick={onClose}
        >
          <X aria-hidden="true" />
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Alternativas para o horário selecionado</p>
      <WindowFields filter={filter} onChange={change} />
      <div className="flex flex-col gap-2">
        <PlaceChips
          blocks={blocksOf(day)}
          floors={floorsOf(day)}
          filter={filter}
          onChange={change}
        />
      </div>
      {!valid ? null : ended ? (
        <p className="text-[13px] font-medium text-muted-foreground">Esse horário já terminou</p>
      ) : (
        <>
          <div className="grid gap-1.5">
            <h3 className="text-[13px] font-semibold text-muted-foreground">Livres</h3>
            {ordered.length === 0 ? (
              <p className="text-[13px] text-foreground">Nenhuma sala livre nesse horário</p>
            ) : (
              <ul className="grid gap-1.5" aria-label="Salas livres no horário">
                {ordered.map((room) => (
                  <li key={room.spaceId} className={cn(ITEM, "flex items-center gap-2")}>
                    <div className="grid min-w-0 flex-1 gap-0.5">
                      <h4 className="truncate text-[13px] font-semibold text-foreground">
                        {room.space.name}
                      </h4>
                      <p className="truncate text-[12px] text-muted-foreground">
                        {room.spaceId === suggested && (
                          <>
                            <span className="font-medium text-primary">Sugerida</span>
                            {" · "}
                          </>
                        )}
                        {placeLabel(room.space.name)}
                      </p>
                      <EquipmentMarks equipment={room.space.equipment} showNotes={showNotes} />
                    </div>
                    {canReserve && (
                      <Button
                        type="button"
                        size="sm"
                        aria-label={`Reservar ${room.space.name}, ${dayLabel(date)}, ${start}–${end}`}
                        onClick={() => onBook({ spaceId: room.spaceId, date, start, end })}
                      >
                        <Plus aria-hidden="true" />
                        Reservar
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
          {busy.length > 0 && (
            <div className="grid gap-1.5">
              <h3 className="text-[13px] font-semibold text-muted-foreground">Ocupadas</h3>
              <ul className="grid gap-1.5" aria-label="Salas ocupadas no horário">
                {busy.map(({ room, reasons }) => (
                  <li key={room.spaceId} className={cn(ITEM, "opacity-80")}>
                    <h4 className="truncate text-[13px] font-semibold text-foreground">
                      {room.space.name}
                    </h4>
                    <EquipmentMarks equipment={room.space.equipment} showNotes={showNotes} />
                    {reasons.map((reason) => (
                      <p
                        key={busyReasonText(reason)}
                        className="truncate text-[12px] text-foreground"
                      >
                        {busyReasonText(reason)}
                      </p>
                    ))}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}
