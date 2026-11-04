import type { AgendaItem, RoomsWeek } from "#/application/bookings";
import { cellsFor } from "#/domain/overview";
import { dayLabel, OverviewCell } from "./overview-cell";

type Props = {
  week: RoomsWeek;
  /** Salas que passaram nos filtros, na ordem recebida. */
  rooms: RoomsWeek["rooms"];
};

function outsideLabel(items: readonly AgendaItem[]): string {
  const count = items.length === 1 ? "1 ocupação" : `${items.length} ocupações`;
  const list = items.map(
    (item) => `${item.title}, ${dayLabel(item.date)}, ${item.start}–${item.end}`,
  );
  return `${count} fora dos blocos: ${list.join("; ")}`;
}

/** Salas × (segunda a sexta × blocos do semestre), um quadradinho por bloco. */
export function RoomsOverview({ week, rooms }: Props) {
  const rows = rooms.map((room) => {
    const days = week.days.map((day) =>
      cellsFor(
        room.occupations.filter((item) => item.date === day.date),
        day.blocks,
      ),
    );
    return { room, days, outside: days.flatMap((day) => day.outside) };
  });
  return (
    <div data-testid="rooms-overview" className="w-full max-w-full overflow-x-auto">
      <div
        className="grid w-max min-w-full items-center"
        style={{
          gridTemplateColumns: `minmax(5rem, 9rem) repeat(${week.days.length}, max-content)`,
        }}
      >
        <div />
        {week.days.map((day) => (
          <div
            key={day.date}
            className="border-l border-border px-1.5 pb-1 text-[12px] font-medium text-muted-foreground first-letter:uppercase"
          >
            {dayLabel(day.date)}
          </div>
        ))}
        {rows.map(({ room, days, outside }) => (
          <div key={room.space.id} className="contents">
            <div className="flex min-w-0 items-center gap-1 pr-2">
              <span
                className="truncate text-[13px] font-medium text-foreground"
                title={room.space.name}
              >
                {room.space.name}
              </span>
              {outside.length > 0 && (
                <span
                  role="img"
                  data-outside={room.space.id}
                  aria-label={outsideLabel(outside)}
                  title={outsideLabel(outside)}
                  className="size-1.5 shrink-0 rounded-full bg-amber-500"
                />
              )}
            </div>
            {week.days.map((day, index) => (
              <div key={day.date} className="flex gap-[3px] border-l border-border px-1.5 py-[3px]">
                {days[index]?.cells.map((cell) => (
                  <OverviewCell
                    key={cell.block.short}
                    cell={cell}
                    room={room.space}
                    date={day.date}
                  />
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
