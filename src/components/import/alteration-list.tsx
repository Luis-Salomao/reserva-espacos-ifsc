import type { RowView } from "#/application/import-report";
import { formatDate, groupAlterations } from "./flow-helpers";
import { Reason, StatusPill } from "./row-parts";

function Side({ title, rows }: { title: string; rows: readonly RowView[] }) {
  return (
    <div className="grid content-start gap-2">
      <h4 className="text-sm font-medium">{title}</h4>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">—</p>
      ) : (
        <ul className="grid gap-2">
          {rows.map((row) => (
            <li key={row.rowKey} className="grid gap-1 rounded-md border bg-background p-2 text-sm">
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
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Alterações lado a lado: o que havia (antes) e o que passa a valer (depois), por aula e data. */
export function AlterationList({ rows }: { rows: readonly RowView[] }) {
  const groups = groupAlterations(rows);
  return (
    <ul className="grid gap-3" aria-label="Alterações antes e depois">
      {groups.map((group) => (
        <li
          key={`${group.date ?? "sem-data"}|${group.title}|${group.before[0]?.rowKey ?? group.after[0]?.rowKey}`}
          className="grid gap-3 rounded-lg border bg-surface p-3"
        >
          <p className="break-words font-medium">
            {group.title}
            {group.date !== null && ` · ${formatDate(group.date)}`}
            {group.blocked && " · Bloqueada"}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Side title="Antes" rows={group.before} />
            <Side title="Depois" rows={group.after} />
          </div>
        </li>
      ))}
    </ul>
  );
}
