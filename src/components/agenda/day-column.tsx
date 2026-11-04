import type { AgendaItem, DayAgenda } from "#/application/bookings";
import { cn } from "#/lib/utils";
import {
  FreeSlot,
  gridHeight,
  HourLines,
  NowLine,
  OccupationCard,
  type Scale,
} from "./agenda-blocks";
import { type Draft, DraftBlock, useDraftGesture } from "./draft-booking";
import { layoutEvents } from "./layout-helpers";
import { SlotContextMenu } from "./slot-context-menu";

type Slot = { spaceId: string; date: string; start: string; end: string };

export type DraftProps = {
  draft?: Draft | null | undefined;
  canDraft?: boolean | undefined;
  onDraftChange?: ((draft: Draft | null) => void) | undefined;
};

type Props = DraftProps & {
  day: DayAgenda;
  scale: Scale;
  /** "HH:MM" quando o dia é hoje (desenha a linha do agora). */
  now: string | null;
  className?: string | undefined;
  onSelectSlot: (slot: Slot) => void;
  onOpenOccupation?: ((occupation: AgendaItem) => void) | undefined;
};

/** Coluna de um dia: horários livres, ocupações, rascunho, linha do agora e menu do botão direito. */
export function DayColumn({
  day,
  scale,
  now,
  className,
  onSelectSlot,
  onOpenOccupation,
  draft = null,
  canDraft = false,
  onDraftChange,
}: Props) {
  const toSlot = (d: Draft): Slot => ({ spaceId: day.spaceId, ...d });
  const gestures = useDraftGesture({
    day,
    scale,
    draft,
    enabled: canDraft && onDraftChange !== undefined,
    onDraftChange: (next) => onDraftChange?.(next),
    onOpenDraft: (d) => onSelectSlot(toSlot(d)),
  });
  const ownDraft = draft !== null && draft.date === day.date ? draft : null;
  return (
    <SlotContextMenu
      day={day}
      scale={scale}
      onSelectSlot={onSelectSlot}
      onOpenOccupation={onOpenOccupation}
    >
      <div
        className={cn("relative min-w-0", className)}
        style={{ height: gridHeight(scale) }}
        {...gestures}
      >
        <HourLines scale={scale} />
        {day.free.map((gap) => (
          <FreeSlot
            key={`gap-${day.date}-${gap.start}-${gap.end}`}
            gap={gap}
            scale={scale}
            quiet={canDraft}
            onSelect={() => onSelectSlot({ spaceId: day.spaceId, date: day.date, ...gap })}
          />
        ))}
        {layoutEvents(day.occupations).map((ev) => (
          <OccupationCard
            key={ev.id}
            ev={ev}
            scale={scale}
            onOpen={onOpenOccupation && (() => onOpenOccupation(ev))}
          />
        ))}
        {ownDraft !== null && (
          <DraftBlock
            draft={ownDraft}
            scale={scale}
            onOpen={() => onSelectSlot(toSlot(ownDraft))}
            onDiscard={() => onDraftChange?.(null)}
          />
        )}
        {now !== null && <NowLine scale={scale} now={now} />}
      </div>
    </SlotContextMenu>
  );
}
