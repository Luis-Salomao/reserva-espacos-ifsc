import { Link } from "@tanstack/react-router";
import type { RoomDay } from "#/application/bookings";
import { HourAxis, makeScale } from "#/components/agenda/agenda-blocks";
import { DayColumn } from "#/components/agenda/day-column";
import type { Draft } from "#/components/agenda/draft-booking";
import { EquipmentMarks } from "#/components/equipment-marks";
import { RoomDetailsButton } from "#/components/rooms/room-details-popover";
import { SpaceDetails } from "#/components/spaces/space-details";
import type { Space } from "#/domain/space";

/** Rascunho único da tela: além do dia e do horário, a sala onde foi desenhado. */
export type RoomDraft = Draft & { spaceId: string };

type Slot = { spaceId: string; date: string; start: string; end: string };

type Props = {
  rooms: readonly RoomDay[];
  date: string;
  /** Agora em hora de parede ("YYYY-MM-DDTHH:MM"): linha do agora quando o dia é hoje. */
  now: string;
  draft: RoomDraft | null;
  canDraft: boolean;
  onDraftChange: (draft: RoomDraft | null) => void;
  onSelectSlot: (slot: Slot) => void;
  /** Espaços por id (capacidade/equipamentos) para o badge compacto e o botão "Detalhes". */
  spacesIndex?: Record<string, Space>;
  /** Observações livres. Visitante não as vê. */
  showNotes?: boolean;
};

const AXIS_WIDTH = 52;
const MIN_COLUMN = 140;

/**
 * Uma coluna por sala no mesmo eixo de horas. A grade rola dentro da própria caixa (nunca a
 * página), com o eixo e os nomes das salas fixos; o rascunho só aparece na coluna da sua sala.
 */
export function RoomsColumns({
  rooms,
  date,
  now,
  draft,
  canDraft,
  onDraftChange,
  onSelectSlot,
  spacesIndex = {},
  showNotes = false,
}: Props) {
  const hours = rooms[0]?.hours ?? { opens: "06:00", closes: "23:00" };
  const scale = makeScale(hours.opens, hours.closes, 0.9);
  const nowTime = now.slice(0, 10) === date ? now.slice(11, 16) : null;
  return (
    <div
      data-testid="rooms-columns"
      className="max-h-[calc(100dvh-14rem)] min-h-80 w-full max-w-full overflow-auto overscroll-x-contain rounded-lg border border-border bg-background select-none"
    >
      <div
        className="grid w-max min-w-full"
        style={{
          gridTemplateColumns: `${AXIS_WIDTH}px repeat(${rooms.length}, minmax(${MIN_COLUMN}px, 1fr))`,
        }}
      >
        <div className="sticky top-0 left-0 z-40 border-r border-b border-border bg-surface" />
        {rooms.map((room) => {
          const space = spacesIndex[room.spaceId];
          return (
            <div
              key={room.spaceId}
              className="sticky top-0 z-30 flex h-auto min-h-10 min-w-0 flex-wrap items-center justify-center gap-1.5 border-b border-l border-border bg-surface px-2 py-1"
            >
              <Link
                to="/"
                search={{ espaco: room.spaceId, data: date }}
                className="truncate rounded-sm text-[13px] font-semibold text-foreground underline-offset-4 hover:underline"
                title={`Abrir a agenda de ${room.space.name}`}
              >
                {room.space.name}
              </Link>
              <EquipmentMarks equipment={room.space.equipment} showNotes={showNotes} />
              {space && <SpaceDetails space={space} compact />}
              <RoomDetailsButton space={space} roomName={room.space.name} />
            </div>
          );
        })}
        <div className="sticky left-0 z-20 bg-background">
          <HourAxis scale={scale} />
        </div>
        {rooms.map((room) => (
          <div
            key={room.spaceId}
            data-room-column={room.spaceId}
            className="border-l border-border"
          >
            <DayColumn
              day={room}
              scale={scale}
              now={nowTime}
              onSelectSlot={onSelectSlot}
              draft={draft?.spaceId === room.spaceId ? draft : null}
              canDraft={canDraft}
              onDraftChange={(next) =>
                onDraftChange(next === null ? null : { ...next, spaceId: room.spaceId })
              }
            />
          </div>
        ))}
      </div>
    </div>
  );
}
