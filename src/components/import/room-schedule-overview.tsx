import { DataTable, TABLE } from "#/components/ds";
import type { RoomView } from "#/server/import-preview-view";
import { weekdayName } from "./weekdays";

const WEEKDAYS = [0, 1, 2, 3, 4] as const;

function daysIn(rooms: readonly RoomView[]): number[] {
  return [
    ...new Set([...WEEKDAYS, ...rooms.flatMap((room) => room.slots.map((slot) => slot.weekday))]),
  ].sort((a, b) => a - b);
}

function RoomSlot({ slot }: { slot: RoomView["slots"][number] }) {
  return (
    <div className="rounded-md border bg-surface-2 px-2 py-1.5 text-left">
      <span className="block text-xs font-medium tabular-nums">
        {slot.start}–{slot.end}
      </span>
      <span className="block text-sm font-medium">{slot.subject}</span>
      {slot.classes !== "" && (
        <span className="block text-xs text-muted-foreground">{slot.classes}</span>
      )}
    </div>
  );
}

/** Grade semanal conjunta para comparar a distribuição do XML sem selecionar uma sala por vez. */
export function RoomScheduleOverview({ rooms }: { rooms: readonly RoomView[] }) {
  const days = daysIn(rooms);

  return (
    <section className="grid gap-3" aria-labelledby="room-schedule-title">
      <div className="grid gap-1">
        <h3 id="room-schedule-title" className="font-medium">
          Grade semanal por sala
        </h3>
        <p className="text-sm text-muted-foreground">
          Compare as salas nesta única visão. Ela mostra somente horários atribuídos a uma sala;
          aulas com várias salas aparecem na seção própria do resumo.
        </p>
      </div>

      <div className="hidden md:block">
        <DataTable label="Grade semanal de todas as salas">
          <table className="w-full min-w-[900px] table-fixed border-collapse text-left">
            <caption className="sr-only">Grade semanal de todas as salas</caption>
            <thead>
              <tr className={TABLE.head}>
                <th scope="col" className={`${TABLE.th} w-36`}>
                  Sala
                </th>
                {days.map((day) => (
                  <th key={day} scope="col" className={`${TABLE.th} border-l`}>
                    {weekdayName(day)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rooms.map((room) => (
                <tr key={room.id} className="border-b last:border-0">
                  <th scope="row" className="px-3 py-2 text-left align-top font-medium">
                    {room.short}
                    {room.name !== "" && room.name !== room.short && (
                      <span className="block text-xs font-normal text-muted-foreground">
                        {room.name}
                      </span>
                    )}
                  </th>
                  {days.map((day) => {
                    const slots = room.slots
                      .filter((slot) => slot.weekday === day)
                      .sort((a, b) => a.start.localeCompare(b.start));
                    return (
                      <td key={day} className="border-l px-1.5 py-2 align-top">
                        <div className="grid gap-1">
                          {slots.length > 0 ? (
                            slots.map((slot) => <RoomSlot key={slot.key} slot={slot} />)
                          ) : (
                            <span className="px-1 py-1.5 text-xs text-muted-foreground">—</span>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </DataTable>
      </div>

      <div className="grid gap-2 md:hidden">
        {rooms.map((room) => (
          <details key={room.id} className="rounded-lg border bg-surface p-3">
            <summary className="cursor-pointer font-medium">
              {room.short} <span className="text-sm text-muted-foreground">({room.slotCount})</span>
            </summary>
            <div className="mt-3 grid gap-3">
              {days.map((day) => {
                const slots = room.slots
                  .filter((slot) => slot.weekday === day)
                  .sort((a, b) => a.start.localeCompare(b.start));
                if (slots.length === 0) return null;
                return (
                  <section key={day} className="grid gap-1.5" aria-label={weekdayName(day)}>
                    <h4 className="text-sm font-medium">{weekdayName(day)}</h4>
                    <div className="grid gap-1.5">
                      {slots.map((slot) => (
                        <RoomSlot key={slot.key} slot={slot} />
                      ))}
                    </div>
                  </section>
                );
              })}
              {room.slots.length === 0 && (
                <p className="text-sm text-muted-foreground">Sem horários com sala única.</p>
              )}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
