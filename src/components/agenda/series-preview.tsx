import { AlertCircle } from "lucide-react";
import { useId } from "react";
import type { RecurringPreview } from "#/application/bookings";
import { Notice } from "#/components/page";
import { Button } from "#/components/ui/button";
import { weekdayOf } from "#/domain/calendar";

const WEEKDAY_SHORT = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];

/** "ter., 10/11" */
function formatDayShort(date: string): string {
  return `${WEEKDAY_SHORT[weekdayOf(date)] ?? ""}., ${date.slice(8, 10)}/${date.slice(5, 7)}`;
}

type SeriesPreviewProps = {
  preview: RecurringPreview;
  /** Sala, horário e finalidade, numa linha. */
  where: string;
  errorMessage: string | null;
  isSubmitting: boolean;
  onBack: () => void;
  onConfirm: () => void;
};

/** Prévia da série antes de confirmar: datas livres, datas com conflito (com o motivo) e ações. */
export function SeriesPreview({
  preview,
  where,
  errorMessage,
  isSubmitting,
  onBack,
  onConfirm,
}: SeriesPreviewProps) {
  const uid = useId();
  const free = preview.dates.filter((item) => item.free);
  const conflicts = preview.dates.flatMap((item) => (item.free ? [] : [item]));
  const confirmLabel = free.length === 1 ? "Reservar 1 data" : `Reservar ${free.length} datas`;

  return (
    <div className="grid gap-4" data-testid="series-preview">
      {errorMessage && (
        <Notice tone="error" role="alert" className="flex items-start gap-2">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <span>{errorMessage}</span>
        </Notice>
      )}
      <div className="grid gap-1">
        <p className="text-sm font-semibold text-foreground">{preview.summary}</p>
        <p className="text-sm text-muted-foreground">{where}</p>
      </div>

      <section aria-labelledby={`${uid}-free`} className="grid gap-1.5">
        <h3 id={`${uid}-free`} className="text-[13px] font-semibold text-foreground">
          Livres ({free.length})
        </h3>
        {free.length > 0 ? (
          <ul className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
            {free.map((item) => (
              <li
                key={item.date}
                className="rounded-md border border-line-free bg-occ-free px-2 py-1 text-xs font-medium tabular-nums text-foreground"
              >
                {formatDayShort(item.date)}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Nenhuma data livre; nada será reservado.</p>
        )}
      </section>

      {conflicts.length > 0 && (
        <section aria-labelledby={`${uid}-busy`} className="grid gap-1.5">
          <h3 id={`${uid}-busy`} className="text-[13px] font-semibold text-foreground">
            Com conflito ({conflicts.length}) — não serão reservadas
          </h3>
          <ul className="grid max-h-40 gap-1 overflow-y-auto text-sm">
            {conflicts.map((item) => (
              <li key={item.date} className="flex flex-wrap gap-x-2">
                <b className="font-semibold tabular-nums">{formatDayShort(item.date)}</b>
                <span className="text-muted-foreground">{item.reason}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" type="button" onClick={onBack} disabled={isSubmitting}>
          Voltar
        </Button>
        <Button type="button" onClick={onConfirm} disabled={isSubmitting || free.length === 0}>
          {isSubmitting ? "Reservando..." : confirmLabel}
        </Button>
      </div>
    </div>
  );
}
