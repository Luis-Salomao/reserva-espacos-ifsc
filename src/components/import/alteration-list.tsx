import type { RowView } from "#/application/import-report";
import { formatDate, groupAlterations, pairBeforeAfter } from "./flow-helpers";
import { Reason, StatusPill } from "./row-parts";

function Side({ title, row }: { title: string; row: RowView | null }) {
  return (
    <div className="grid content-start gap-1 rounded-md border bg-background p-2 text-sm">
      <h4 className="font-medium">{title}</h4>
      {row === null ? (
        <p className="text-muted-foreground">—</p>
      ) : (
        <>
          <span className="break-words">
            {row.startTime}–{row.endTime} · {row.spaceName ?? "Sem sala"}
          </span>
          {row.responsibleName !== null && (
            <span className="break-words text-muted-foreground">{row.responsibleName}</span>
          )}
          <span>
            <StatusPill status={row.status} />
          </span>
          <Reason row={row} />
        </>
      )}
    </div>
  );
}

/**
 * Alterações lado a lado, por aula e data. Dentro do grupo, as ocupações de antes e de depois são
 * casadas uma a uma por horário (turmas divididas na mesma aula e data viram vários pares).
 */
export function AlterationList({ rows }: { rows: readonly RowView[] }) {
  const groups = groupAlterations(rows);
  return (
    <ul className="grid gap-3" aria-label="Alterações antes e depois">
      {groups.map((group) => (
        <li
          key={`${group.date ?? "sem-data"}|${group.title}|${group.before[0]?.rowKey ?? group.after[0]?.rowKey}`}
          className="grid gap-2 rounded-lg border bg-surface p-3"
        >
          <p className="break-words font-medium">
            {group.title}
            {group.date !== null && ` · ${formatDate(group.date)}`}
            {group.blocked && " · Bloqueada"}
          </p>
          {pairBeforeAfter(group.before, group.after).map((pair) => (
            <div
              key={`${pair.before?.rowKey ?? "-"}|${pair.after?.rowKey ?? "-"}`}
              className="grid gap-2 sm:grid-cols-2"
            >
              <Side title="Antes" row={pair.before} />
              <Side title="Depois" row={pair.after} />
            </div>
          ))}
        </li>
      ))}
    </ul>
  );
}
