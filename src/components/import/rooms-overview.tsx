import { DataTable, TABLE } from "#/components/ds";
import { Button } from "#/components/ui/button";
import type { OverlapView, RoomView } from "#/server/import-preview-view";

type Props = {
  rooms: readonly RoomView[];
  overlaps: readonly OverlapView[];
  truncated: boolean;
  onShowRoom: (roomId: string) => void;
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

/** Resumo de todas as salas do XML; o seletor individual continua disponível abaixo. */
export function ImportRoomsOverview({ rooms, overlaps, truncated, onShowRoom }: Props) {
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
        incluem aulas que listam várias salas; a grade detalhada mostra somente horários com uma
        sala atribuída.
      </p>
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
                Ocorrências no XML
              </th>
              <th scope="col" className={TABLE.th}>
                Dias
              </th>
              <th scope="col" className={TABLE.th}>
                Sobreposições
              </th>
              <th scope="col" className={TABLE.th}>
                Detalhe
              </th>
            </tr>
          </thead>
          <tbody>
            {rooms.map((room) => {
              const days = room.weekdays.length;
              const counts = conflicts.get(room.id) ?? { certain: 0, possible: 0 };
              return (
                <tr key={room.id} className="border-b last:border-0">
                  <th scope="row" className="px-3 py-2 text-left font-medium">
                    <span>{room.short}</span>
                    {room.name && room.name !== room.short && (
                      <span className="block text-xs font-normal text-muted-foreground">
                        {room.name}
                      </span>
                    )}
                  </th>
                  <td className="px-3 py-2 text-sm">
                    {room.slotCount === 0
                      ? "Sem horários no arquivo"
                      : `${room.slotCount} ${room.slotCount === 1 ? "ocorrência" : "ocorrências"}`}
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
                      aria-label={`Ver grade da sala ${room.short}`}
                      onClick={() => onShowRoom(room.id)}
                    >
                      Ver grade
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </DataTable>
    </div>
  );
}
