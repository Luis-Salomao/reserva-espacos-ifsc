import { CalendarPlus, Clock, Eye, Layers } from "lucide-react";
import { ContextMenu } from "radix-ui";
import { type ReactNode, useState } from "react";
import type { AgendaItem, DayAgenda } from "#/application/bookings";
import { minutesAt, type Scale } from "./agenda-blocks";
import { timeToMinutes } from "./layout-helpers";

type Slot = { spaceId: string; date: string; start: string; end: string };

const SNAP = 30;
const DEFAULT_LENGTH = 60;

const DAY_LABEL = new Intl.DateTimeFormat("pt-BR", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

const hhmm = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

type Choice =
  | {
      kind: "free";
      at: string;
      quick: Slot;
      block: { slot: Slot; short: string } | null;
      gap: Slot;
    }
  | { kind: "busy"; at: string; occupation: AgendaItem };

/** O que há no minuto clicado: um intervalo livre (com sugestões) ou uma ocupação. */
function choiceAt(day: DayAgenda, minute: number): Choice | null {
  const snapped = Math.floor(minute / SNAP) * SNAP;
  const busy = day.occupations.find(
    (o) => timeToMinutes(o.start) <= minute && minute < timeToMinutes(o.end),
  );
  if (busy !== undefined) return { kind: "busy", at: hhmm(snapped), occupation: busy };
  const gap = day.free.find(
    (g) => timeToMinutes(g.start) <= minute && minute < timeToMinutes(g.end),
  );
  if (gap === undefined) return null;
  const slot = (start: string, end: string): Slot => ({
    spaceId: day.spaceId,
    date: day.date,
    start,
    end,
  });
  const gapStart = timeToMinutes(gap.start);
  const gapEnd = timeToMinutes(gap.end);
  const start = Math.max(snapped, gapStart);
  const end = Math.min(start + DEFAULT_LENGTH, gapEnd);
  const block = day.blocks.find(
    (b) =>
      timeToMinutes(b.start) <= minute &&
      minute < timeToMinutes(b.end) &&
      timeToMinutes(b.start) >= gapStart &&
      timeToMinutes(b.end) <= gapEnd,
  );
  return {
    kind: "free",
    at: hhmm(start),
    quick: slot(hhmm(start), hhmm(end)),
    block: block === undefined ? null : { slot: slot(block.start, block.end), short: block.short },
    gap: slot(gap.start, gap.end),
  };
}

type Props = {
  day: DayAgenda;
  scale: Scale;
  onSelectSlot: (slot: Slot) => void;
  onOpenOccupation?: ((occupation: AgendaItem) => void) | undefined;
  children: ReactNode;
};

const ITEM =
  "flex h-8 cursor-default items-center gap-2 rounded-sm px-2 text-[13px] outline-none select-none data-[highlighted]:bg-surface-2 [&_svg]:size-3.5 [&_svg]:text-muted-foreground";

/**
 * Botão direito (ou toque longo) numa coluna de dia: reservar a partir daquele horário, o bloco
 * de aula ou o intervalo livre inteiro; em cima de uma ocupação, abre os detalhes.
 */
export function SlotContextMenu({ day, scale, onSelectSlot, onOpenOccupation, children }: Props) {
  const [choice, setChoice] = useState<Choice | null>(null);
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger
        asChild
        onContextMenu={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const next = choiceAt(day, minutesAt(scale, event.clientY - rect.top));
          setChoice(next);
          if (next === null) event.preventDefault();
        }}
      >
        {children}
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="z-50 min-w-56 rounded-md border bg-popover p-1 text-popover-foreground shadow-lg data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95">
          {choice !== null && (
            <ContextMenu.Label className="px-2 pt-1 pb-1.5 text-[11px] text-muted-foreground first-letter:uppercase">
              {DAY_LABEL.format(new Date(`${day.date}T12:00:00Z`))} · {choice.at}
            </ContextMenu.Label>
          )}
          {choice?.kind === "free" && (
            <>
              <ContextMenu.Item className={ITEM} onSelect={() => onSelectSlot(choice.quick)}>
                <CalendarPlus aria-hidden="true" />
                Nova reserva {choice.quick.start}–{choice.quick.end}
              </ContextMenu.Item>
              {choice.block !== null && (
                <ContextMenu.Item
                  className={ITEM}
                  onSelect={() => choice.block !== null && onSelectSlot(choice.block.slot)}
                >
                  <Layers aria-hidden="true" />
                  Bloco {choice.block.short} · {choice.block.slot.start}–{choice.block.slot.end}
                </ContextMenu.Item>
              )}
              <ContextMenu.Separator className="my-1 h-px bg-border" />
              <ContextMenu.Item className={ITEM} onSelect={() => onSelectSlot(choice.gap)}>
                <Clock aria-hidden="true" />
                Todo o horário livre {choice.gap.start}–{choice.gap.end}
              </ContextMenu.Item>
            </>
          )}
          {choice?.kind === "busy" && (
            <ContextMenu.Item
              className={ITEM}
              onSelect={() => onOpenOccupation?.(choice.occupation)}
            >
              <Eye aria-hidden="true" />
              <span className="truncate">Ver {choice.occupation.title}</span>
            </ContextMenu.Item>
          )}
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
