import { Fragment, useState } from "react";
import { DataTable, TABLE } from "#/components/ds";
import { Button } from "#/components/ui/button";
import type { OverlapView, PreviewView, RoomView } from "#/server/import-preview-view";
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

function normalized(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
}

function roomLabel(room: RoomView): string {
  const short = room.short.trim();
  const name = room.name.trim();
  return name !== "" && normalized(name) !== normalized(short) ? `${short} — ${name}` : short;
}

/** Resumo geral acionável: sinaliza salas para revisão e abre os horários na própria tabela. */
export function ImportRoomsOverview({ rooms, overlaps, truncated, periods }: Props) {
  const [expandedRoomId, setExpandedRoomId] = useState<string | null>(null);
  const conflicts = new Map<string, { certain: number; possible: number }>();
  for (const overlap of overlaps) {
    const total = conflicts.get(overlap.roomId) ?? { certain: 0, possible: 0 };
    total[overlap.kind] += 1;
    conflicts.set(overlap.roomId, total);
  }

  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">
        Esta tabela resume a estrutura do XML. “Sala única no arquivo” não significa que ela já
        esteja vinculada a um espaço do IFSC; confira os vínculos no passo Salas. As ocorrências
        incluem aulas que listam várias salas; os horários detalhados abaixo mostram somente aulas
        atribuídas a uma sala.
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
      <DataTable label="Visão geral das salas do arquivo">
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
            {[...rooms]
              .sort((a, b) => {
                const aConflict = conflicts.has(a.id) ? 0 : 1;
                const bConflict = conflicts.has(b.id) ? 0 : 1;
                const aEmpty = a.slotCount === 0 ? 0 : 1;
                const bEmpty = b.slotCount === 0 ? 0 : 1;
                return aConflict - bConflict || aEmpty - bEmpty || a.short.localeCompare(b.short);
              })
              .map((room) => {
                const days = room.weekdays.length;
                const counts = conflicts.get(room.id) ?? { certain: 0, possible: 0 };
                const expanded = expandedRoomId === room.id;
                const detailId = `import-room-${encodeURIComponent(room.id)}`;
                const hasConflict = counts.certain > 0 || counts.possible > 0;
                return (
                  <Fragment key={room.id}>
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
                          aria-expanded={expanded}
                          aria-controls={detailId}
                          aria-label={`${expanded ? "Fechar" : "Conferir"} horários de ${roomLabel(room)}`}
                          onClick={() => setExpandedRoomId(expanded ? null : room.id)}
                        >
                          {expanded ? "Fechar" : "Conferir sala"}
                        </Button>
                      </td>
                    </tr>
                    {expanded && (
                      <tr key={`${room.id}-detail`} className="border-b bg-surface-2">
                        <td colSpan={5} className="p-3">
                          <section
                            id={detailId}
                            aria-label={`Horários de ${roomLabel(room)}`}
                            className="grid gap-2"
                          >
                            <h4 className="font-medium">{roomLabel(room)} — horários atribuídos</h4>
                            {room.slots.length > 0 ? (
                              <WeeklyGrid room={room} periods={periods} />
                            ) : room.slotCount === 0 ? (
                              <p className="text-sm text-muted-foreground">
                                Nenhum horário desta sala foi encontrado no arquivo.
                              </p>
                            ) : (
                              <p className="text-sm text-muted-foreground">
                                Os horários desta sala aparecem em aulas com várias salas e não
                                podem ser atribuídos a uma única grade. Confira a seção “Aulas com
                                várias salas”.
                              </p>
                            )}
                          </section>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
          </tbody>
        </table>
      </DataTable>
    </div>
  );
}

