import { DataTable, TABLE } from "#/components/ds";
import { cn } from "#/lib/utils";
import type { PreviewView, RoomView, SlotView } from "#/server/import-preview-view";
import { SlotCard } from "./slot-card";
import { weekdayName } from "./weekdays";

type Props = { room: RoomView; periods: PreviewView["periods"] };

function usedWeekdays(slots: SlotView[]): number[] {
  const days = new Set([0, 1, 2, 3, 4, ...slots.map((slot) => slot.weekday)]);
  return [...days].sort((a, b) => a - b);
}

/** Grade semanal de uma sala: lista por dia no celular; tabela dia × bloco em telas médias. */
export function WeeklyGrid({ room, periods }: Props) {
  if (room.slots.length === 0) {
    return <p className="text-muted-foreground">Nenhum horário importado para esta sala.</p>;
  }
  const days = usedWeekdays(room.slots);
  return (
    <>
      <div className="grid gap-3 md:hidden">
        {days.map((day) => {
          const daySlots = room.slots.filter((slot) => slot.weekday === day);
          return (
            <section key={day} aria-label={weekdayName(day)} className="grid gap-1.5">
              <h3 className="font-medium">{weekdayName(day)}</h3>
              {daySlots.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem horários.</p>
              ) : (
                daySlots.map((slot) => <SlotCard key={slot.key} slot={slot} />)
              )}
            </section>
          );
        })}
      </div>
      <DataTable label={`Grade semanal da sala ${room.short}`} className="hidden md:block">
        <table className="w-full table-fixed border-collapse text-left">
          <caption className="sr-only">Grade semanal da sala {room.short}</caption>
          <thead>
            <tr>
              <th scope="col" className={cn(TABLE.th, TABLE.head, "w-28")}>
                Bloco
              </th>
              {days.map((day) => (
                <th key={day} scope="col" className={cn(TABLE.th, TABLE.head, "border-l")}>
                  {weekdayName(day)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {periods.map((period) => (
              <tr key={period.number}>
                <th
                  scope="row"
                  className="border-b bg-surface p-2 text-left align-top text-sm font-medium"
                >
                  {period.name || period.number}
                  <span className="block font-normal text-muted-foreground">
                    {period.start}–{period.end}
                  </span>
                </th>
                {days.map((day) => (
                  <td key={day} className="border-b border-l p-1.5 align-top">
                    <div className="grid gap-1">
                      {room.slots
                        .filter((slot) => slot.weekday === day && slot.periodFrom === period.number)
                        .map((slot) => (
                          <SlotCard key={slot.key} slot={slot} />
                        ))}
                      {room.slots
                        .filter(
                          (slot) =>
                            slot.weekday === day &&
                            slot.periodFrom !== period.number &&
                            slot.periods.includes(period.number),
                        )
                        .map((slot) => (
                          <p
                            key={slot.key}
                            className="rounded-[10px] border border-dashed border-line-imported bg-occ-imported px-2 py-1 text-xs text-foreground"
                          >
                            continuação: {slot.subject} (até {slot.end})
                          </p>
                        ))}
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </DataTable>
    </>
  );
}
