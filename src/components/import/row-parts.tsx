import type { RowView } from "#/application/import-report";
import type { ImportRowStatus } from "#/domain/import-batch";
import { describeReason } from "#/domain/import-reasons";
import { formatDate, formatDateTime, STATUS_LABELS, STATUS_TONE } from "./flow-helpers";
import { weekdayName } from "./weekdays";

/** "Seg 03/08" quando há data; só o dia da semana nas aulas sem data (não aplicáveis). */
export function dayLabel(row: RowView): string {
  const name = row.weekday === null ? "" : weekdayName(row.weekday).slice(0, 3);
  if (row.date === null) return row.weekday === null ? "—" : weekdayName(row.weekday);
  return `${name} ${formatDate(row.date)}`.trim();
}

export function StatusPill({ status }: { status: ImportRowStatus }) {
  return (
    <span
      className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_TONE[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

export function Reason({ row }: { row: RowView }) {
  if (row.reasonCode === null && row.reasonDetail === null && row.conflictWith === null) {
    return <span className="text-muted-foreground">—</span>;
  }
  const reason = describeReason(row.reasonCode, row.reasonDetail);
  return (
    <div className="grid gap-0.5">
      {row.reasonCode !== null && <span className="font-medium">{reason.label}</span>}
      {reason.detail !== null && <span className="break-words">{reason.detail}</span>}
      {row.conflictWith !== null && (
        <span className="break-words">
          Conflita com “{row.conflictWith.title}” ({formatDateTime(row.conflictWith.startsAt)}–
          {row.conflictWith.endsAt.slice(11)}).
        </span>
      )}
    </div>
  );
}
