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
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full table-fixed border-collapse text-left">
          <caption className="sr-only">Grade semanal da sala {room.short}</caption>
          <thead>
            <tr>
              <th scope="col" className="w-28 border bg-surface-2 p-2 text-sm">
                Bloco
              </th>
              {days.map((day) => (
                <th key={day} scope="col" className="border bg-surface-2 p-2 text-sm">
                  {weekdayName(day)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {periods.map((period) => (
              <tr key={period.number}>
                <th scope="row" className="border bg-surface-2 p-2 align-top text-sm font-medium">
                  {period.name || period.number}
                  <span className="block font-normal text-muted-foreground">
                    {period.start}–{period.end}
                  </span>
                </th>
                {days.map((day) => (
                  <td key={day} className="border p-1 align-top">
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
                            slot.periodFrom < period.number &&
                            period.number <= slot.periodTo,
                        )
                        .map((slot) => (
                          <p
                            key={slot.key}
                            className="rounded-md border border-dashed bg-occ-imported px-2 py-1 text-xs text-foreground"
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
      </div>
    </>
  );
}
