import type { AgendaItem, DayAgenda } from "#/application/bookings";
import { cn } from "#/lib/utils";
import {
  FreeSlot,
  gridHeight,
  HourLines,
  NowLine,
  OccupationCard,
  type Scale,
  yOf,
} from "./agenda-blocks";
import { type Draft, DraftBlock, useDraftGesture } from "./draft-booking";
import { futureFree, layoutEvents, timeToMinutes } from "./layout-helpers";
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

/**
 * Véu sobre o que já passou: o dia inteiro (anterior a hoje) ou do início até o agora (hoje).
 * Sem `pointer-events`: as ocupações continuam abrindo os detalhes.
 */
function PastShade({ scale, day }: { scale: Scale; day: DayAgenda }) {
  const today = day.now.slice(0, 10);
  if (day.date > today) return null;
  const cutoff =
    day.date < today ? scale.closes : Math.min(timeToMinutes(day.now.slice(11, 16)), scale.closes);
  if (cutoff <= scale.opens) return null;
  return (
    <div
      aria-hidden="true"
      data-past-shade=""
      className="pointer-events-none absolute inset-x-0 top-0 z-10 bg-background/60"
      style={{ height: yOf(scale, cutoff) }}
    />
  );
}

/**
 * Coluna de um dia: horários livres, ocupações, rascunho, linha do agora e menu do botão direito.
 * O que já passou fica apagado e sem reserva: não há intervalo livre antes do agora, então
 * clicar, arrastar ou abrir o menu ali não cria rascunho.
 */
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
  const live = { ...day, free: futureFree(day.date, day.free, day.now) };
  const toSlot = (d: Draft): Slot => ({ spaceId: day.spaceId, ...d });
  const gestures = useDraftGesture({
    day: live,
    scale,
    draft,
    enabled: canDraft && onDraftChange !== undefined,
    onDraftChange: (next) => onDraftChange?.(next),
    onOpenDraft: (d) => onSelectSlot(toSlot(d)),
  });
  const ownDraft = draft !== null && draft.date === day.date ? draft : null;
  return (
    <SlotContextMenu
      day={live}
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
        {live.free.map((gap) => (
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
        <PastShade scale={scale} day={day} />
        {now !== null && <NowLine scale={scale} now={now} />}
      </div>
    </SlotContextMenu>
  );
}
