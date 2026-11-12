import { useState } from "react";
import { DataTable, TABLE } from "#/components/ds";
import { Button } from "#/components/ui/button";
import type { OverlapView, PreviewView, RoomView } from "#/server/import-preview-view";
import { weekdayName } from "./weekdays";
import { WeeklyGrid } from "./weekly-grid";

type Props = {
  rooms: readonly RoomView[];
  overlaps: readonly OverlapView[];
  truncated: boolean;
  periods: PreviewView["periods"];
};

function conflictLabel(counts: { certain: number; possible: number }): string {
  const parts = [
    counts.certain > 0 ? `${counts.certain} ${counts.certain === 1 ? "certa" : "certas"}` : "",
    counts.possible > 0
      ? `${counts.possible} ${counts.possible === 1 ? "possível" : "possíveis"}`
      : "",
  ].filter(Boolean);
  return parts.length === 0 ? "Nenhuma apontada" : parts.join(", ");
}

function roomConflictLabel(counts: { certain: number; possible: number }): string {
  const parts = [
    counts.certain > 0 ? `${counts.certain} ${counts.certain === 1 ? "certa" : "certas"}` : "",
    counts.possible > 0
      ? `${counts.possible} ${counts.possible === 1 ? "possível" : "possíveis"}`
      : "",
  ].filter(Boolean);
  const total = counts.certain + counts.possible;
  return `${parts.join(" e ")} ${total === 1 ? "sobreposição apontada" : "sobreposições apontadas"}`;
}

function normalized(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
}

function roomLabel(room: RoomView): string {
  const short = room.short.trim();
  const name = room.name.trim();
  return name !== "" && normalized(name) !== normalized(short) ? `${short} — ${name}` : short;
}

/** Conferência sequencial por sala, com uma visão geral compacta para navegação direta. */
export function ImportRoomsOverview({ rooms, overlaps, truncated, periods }: Props) {
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const conflicts = new Map<string, { certain: number; possible: number }>();
  for (const overlap of overlaps) {
    const total = conflicts.get(overlap.roomId) ?? { certain: 0, possible: 0 };
    total[overlap.kind] += 1;
    conflicts.set(overlap.roomId, total);
  }

  const orderedRooms = [...rooms].sort((a, b) => {
    const aConflict = conflicts.has(a.id) ? 0 : 1;
    const bConflict = conflicts.has(b.id) ? 0 : 1;
    const aEmpty = a.slotCount === 0 ? 0 : 1;
    const bEmpty = b.slotCount === 0 ? 0 : 1;
    return aConflict - bConflict || aEmpty - bEmpty || a.short.localeCompare(b.short);
  });
  const selectedIndex = orderedRooms.findIndex((room) => room.id === selectedRoomId);
  const roomIndex = Math.max(selectedIndex, 0);
  const room = orderedRooms[roomIndex];
  const roomConflicts =
    room === undefined
      ? { certain: 0, possible: 0 }
      : (conflicts.get(room.id) ?? { certain: 0, possible: 0 });
  const selectedHasConflict = roomConflicts.certain > 0 || roomConflicts.possible > 0;
  const selectedOverlaps =
    room === undefined ? [] : overlaps.filter((overlap) => overlap.roomId === room.id);
  const selectedDetailId =
    room === undefined ? undefined : `import-room-${encodeURIComponent(room.id)}`;

  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">
        Confira uma sala por vez. A ordem começa pelas salas com sobreposições e pelas que não têm
        horários listados. Esta prévia mostra o que veio no XML; o vínculo com os espaços do IFSC é
        definido no passo Salas.
      </p>
      <div className="flex flex-wrap gap-2 text-sm">
        <span className="rounded-full border px-3 py-1">{rooms.length} salas no arquivo</span>
        <span className="rounded-full border px-3 py-1">
          {rooms.filter((room) => room.slotCount === 0).length} sem horários listados
        </span>
        <span className="rounded-full border px-3 py-1">
          {
            rooms.filter((room) => {
              const counts = conflicts.get(room.id);
              return counts !== undefined && (counts.certain > 0 || counts.possible > 0);
            }).length
          }{" "}
          com sobreposição apontada
        </span>
      </div>
      {truncated && (
        <p role="status" className="text-sm text-muted-foreground">
          O detalhamento de sobreposições foi limitado; os totais por sala podem estar parciais.
        </p>
      )}
      {room !== undefined && (
        <section
          className="grid gap-3 rounded-xl border bg-surface p-3 sm:p-4"
          aria-label="Conferência sala a sala"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="grid gap-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Conferência sala a sala · {roomIndex + 1} de {orderedRooms.length}
              </p>
              <h3 className="text-lg font-semibold">{roomLabel(room)}</h3>
              <p className="text-sm text-muted-foreground">
                {room.slotCount} {room.slotCount === 1 ? "horário listado" : "horários listados"} ·{" "}
                {room.weekdays.length} {room.weekdays.length === 1 ? "dia" : "dias"}
                {selectedHasConflict && (
                  <span className="text-destructive"> · revisar sobreposição</span>
                )}
                {!selectedHasConflict && room.slotCount === 0 && " · nenhum horário listado"}
              </p>
              <p className="text-xs text-muted-foreground">
                A contagem inclui aulas que listam várias salas; a grade mostra somente as
                atribuídas exclusivamente a esta sala.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={roomIndex === 0}
                onClick={() => setSelectedRoomId(orderedRooms[roomIndex - 1]?.id ?? null)}
              >
                Sala anterior
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={roomIndex === orderedRooms.length - 1}
                onClick={() => setSelectedRoomId(orderedRooms[roomIndex + 1]?.id ?? null)}
              >
                Próxima sala
              </Button>
            </div>
          </div>
          <div id={selectedDetailId} aria-live="polite">
            {room.slots.length > 0 ? (
              <WeeklyGrid room={room} periods={periods} />
            ) : room.slotCount === 0 ? (
              <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                Nenhum horário desta sala foi encontrado no arquivo.
              </p>
            ) : (
              <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                Os horários desta sala aparecem em aulas com várias salas e não podem ser atribuídos
                a uma única grade. Confira também “Aulas com várias salas”.
              </p>
            )}
          </div>
          {selectedOverlaps.length > 0 && (
            <section aria-label={`Sobreposições de ${room.short}`} className="grid gap-2">
              <h4 className="font-medium">Sobreposições apontadas nesta sala</h4>
              <p className="text-sm text-muted-foreground">
                As possíveis envolvem aulas com várias salas e precisam de conferência; o XML não
                confirma que todas ocupem este espaço ao mesmo tempo.
              </p>
              <ul className="grid gap-2">
                {selectedOverlaps.map((overlap) => (
                  <li key={overlap.key} className="rounded-lg border p-3 text-sm">
                    <p className="font-medium">
                      {overlap.kind === "certain" ? "Sobreposição certa" : "Sobreposição possível"}
                      {" · "}
                      {weekdayName(overlap.weekday)}
                    </p>
                    <p>
                      {overlap.a.label}
                      {overlap.a.classes === "" ? "" : ` (${overlap.a.classes})`} {overlap.a.start}–
                      {overlap.a.end}
                    </p>
                    <p>
                      {overlap.b.label}
                      {overlap.b.classes === "" ? "" : ` (${overlap.b.classes})`} {overlap.b.start}–
                      {overlap.b.end}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </section>
      )}
      <DataTable label="Visão geral das salas do arquivo" className="hidden md:block">
        <table className={TABLE.table}>
          <caption className="sr-only">Visão geral das salas do arquivo</caption>
          <thead>
            <tr className={TABLE.head}>
              <th scope="col" className={TABLE.th}>
                Sala no XML
              </th>
              <th scope="col" className={TABLE.th}>
                Horários no arquivo
              </th>
              <th scope="col" className={TABLE.th}>
                Dias
              </th>
              <th scope="col" className={TABLE.th}>
                Sobreposições
              </th>
              <th scope="col" className={TABLE.th}>
                Conferência
              </th>
            </tr>
          </thead>
          <tbody>
            {orderedRooms.map((room) => {
              const days = room.weekdays.length;
              const counts = conflicts.get(room.id) ?? { certain: 0, possible: 0 };
              const hasConflict = counts.certain > 0 || counts.possible > 0;
              const selected = room.id === orderedRooms[roomIndex]?.id;
              return (
                <tr key={room.id} className="border-b last:border-0">
                  <th scope="row" className="px-3 py-2 text-left font-medium">
                    <span>{roomLabel(room)}</span>
                    {hasConflict && (
                      <span className="mt-1 block text-xs text-destructive">
                        Revisar sobreposição
                      </span>
                    )}
                    {!hasConflict && room.slotCount === 0 && (
                      <span className="mt-1 block text-xs text-muted-foreground">
                        Sem horários no arquivo
                      </span>
                    )}
                  </th>
                  <td className="px-3 py-2 text-sm">
                    {room.slotCount === 0
                      ? "0 horários"
                      : `${room.slotCount} ${room.slotCount === 1 ? "horário" : "horários"}`}
                  </td>
                  <td className="px-3 py-2 text-sm">
                    {days} {days === 1 ? "dia" : "dias"}
                  </td>
                  <td className="px-3 py-2 text-sm">{conflictLabel(counts)}</td>
                  <td className="px-3 py-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      aria-current={selected ? "true" : undefined}
                      aria-label={`Abrir ${roomLabel(room)} na conferência sala a sala`}
                      onClick={() => setSelectedRoomId(room.id)}
                    >
                      {selected ? "Sala exibida" : "Abrir sala"}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </DataTable>
      <section className="grid gap-2 md:hidden" aria-label="Resumo das salas do arquivo">
        {orderedRooms.map((room) => {
          const counts = conflicts.get(room.id) ?? { certain: 0, possible: 0 };
          const hasConflict = counts.certain > 0 || counts.possible > 0;
          const selected = room.id === orderedRooms[roomIndex]?.id;
          return (
            <article key={room.id} className="grid gap-2 rounded-lg border p-3">
              <div className="flex min-w-0 items-start justify-between gap-2">
                <h4 className="min-w-0 break-words font-medium">{roomLabel(room)}</h4>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {room.slotCount} {room.slotCount === 1 ? "horário" : "horários"}
                </span>
              </div>
              <p
                className={
                  hasConflict ? "text-sm text-destructive" : "text-sm text-muted-foreground"
                }
              >
                {hasConflict
                  ? roomConflictLabel(counts)
                  : room.slotCount === 0
                    ? "Sem horários no arquivo"
                    : `${room.weekdays.length} ${room.weekdays.length === 1 ? "dia" : "dias"} · sem sobreposição apontada`}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                aria-current={selected ? "true" : undefined}
                aria-label={`Abrir ${roomLabel(room)} na conferência sala a sala`}
                onClick={() => setSelectedRoomId(room.id)}
              >
                {selected ? "Sala exibida" : "Conferir esta sala"}
              </Button>
            </article>
          );
        })}
      </section>
    </div>
  );
}
