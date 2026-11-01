import type { SlotView } from "#/server/import-preview-view";
import { SlotCard } from "./slot-card";
import { weekdayName } from "./weekdays";

type Props = { slots: SlotView[]; empty: string };

/** Lista simples de horários (sem sala ou com várias salas), com o dia de cada um. */
export function SlotList({ slots, empty }: Props) {
  if (slots.length === 0) return <p className="text-muted-foreground">{empty}</p>;
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {slots.map((slot) => (
        <li key={slot.key} className="grid gap-1">
          <span className="text-sm font-medium">{weekdayName(slot.weekday)}</span>
          <SlotCard slot={slot} showRooms />
        </li>
      ))}
    </ul>
  );
}
