import { AlertCircle, Calendar, Clock, DoorClosed, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { runAdminAction } from "#/components/admin/use-admin-action";
import { ChoiceCard } from "#/components/ds";
import { Notice } from "#/components/page";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "#/components/ui/alert-dialog";
import { Button } from "#/components/ui/button";
import { Label } from "#/components/ui/label";
import { Textarea } from "#/components/ui/textarea";
import type { AdminResponse } from "#/server/admin-actions";
import { cancelOccupationFn, previewSeriesFn } from "#/server/booking-fns";

export type CancelTarget = {
  id: string;
  date: string; // "YYYY-MM-DD"
  start: string; // "HH:MM"
  end: string; // "HH:MM"
  title: string;
  source: "import" | "manual";
  spaceName: string;
  /** Reserva avulsa de uma série recorrente: oferece "esta e as próximas". */
  inSeries?: boolean;
  /** Reserva de outra pessoa (cancelada pela administração): o motivo opcional vai ao dono. */
  foreign?: boolean;
};

export type CancelDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target?: CancelTarget | null;
  /** Aula importada desmarcada uma data por vez: sem opção de série nem prévia. */
  dateOnly?: boolean;
  occupation?: CancelTarget | null;
  onSuccess?: (result: { cancelled: number; scope: "data" | "serie" }) => void;
  onCancelled?: (result?: { cancelled: number; scope: "data" | "serie" }) => void;
  cancelFn?: (input: {
    data: { occupationId: string; scope: "data" | "serie"; expectedCount?: number; note?: string };
  }) => Promise<AdminResponse<{ cancelled: number }>>;
  previewFn?: (input: {
    data: { occupationId: string };
  }) => Promise<AdminResponse<{ dates: string[] }>>;
};

function formatShortDate(dateStr: string): string {
  const parts = dateStr.split("-");
  const d = parts[2] ?? "01";
  const m = parts[1] ?? "01";
  return `${d}/${m}`;
}

function formatLongDate(dateStr: string): string {
  const [yStr = "2026", mStr = "11", dStr = "3"] = dateStr.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);
  const dt = new Date(y, m - 1, d);
  const weekdays = [
    "domingo",
    "segunda-feira",
    "terça-feira",
    "quarta-feira",
    "quinta-feira",
    "sexta-feira",
    "sábado",
  ];
  const months = [
    "janeiro",
    "fevereiro",
    "março",
    "abril",
    "maio",
    "junho",
    "julho",
    "agosto",
    "setembro",
    "outubro",
    "novembro",
    "dezembro",
  ];
  return `${weekdays[dt.getDay()] ?? ""}, ${d} de ${months[m - 1] ?? ""} de ${y}`;
}

export function CancelDialog({
  open,
  onOpenChange,
  target,
  occupation,
  dateOnly = false,
  onSuccess,
  onCancelled,
  cancelFn,
  previewFn,
}: CancelDialogProps) {
  const item = target ?? occupation ?? null;

  const [scope, setScope] = useState<"data" | "serie">("data");
  const [previewDates, setPreviewDates] = useState<string[] | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [note, setNote] = useState("");

  // Reseta estado quando o diálogo abre ou o item muda
  useEffect(() => {
    if (open && item) {
      setScope("data");
      setPreviewDates(null);
      setIsLoadingPreview(false);
      setIsSubmitting(false);
      setErrorMessage(null);
      setNote("");
    }
  }, [open, item]);

  async function fetchPreview(occupationId: string, clearError = true) {
    setIsLoadingPreview(true);
    if (clearError) {
      setErrorMessage(null);
    }
    const caller = previewFn ?? previewSeriesFn;
    const res = await runAdminAction(() =>
      caller({
        data: { occupationId },
      }),
    );
    setIsLoadingPreview(false);

    if (res.ok) {
      setPreviewDates(res.data.dates);
    } else {
      setErrorMessage(res.message);
      setPreviewDates(null);
    }
  }

  function handleScopeChange(newScope: "data" | "serie") {
    setScope(newScope);
    setErrorMessage(null);
    if (newScope === "serie" && item) {
      void fetchPreview(item.id);
    }
  }

  async function handleConfirm() {
    if (!item) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    const caller = cancelFn ?? cancelOccupationFn;
    const res = await runAdminAction(() =>
      caller({
        data: {
          occupationId: item.id,
          scope,
          ...(scope === "serie" && previewDates !== null
            ? { expectedCount: previewDates.length }
            : {}),
          ...(item.foreign === true && note.trim() !== "" ? { note: note.trim() } : {}),
        },
      }),
    );

    setIsSubmitting(false);

    if (res.ok) {
      onSuccess?.({ cancelled: res.data.cancelled, scope });
      onCancelled?.({ cancelled: res.data.cancelled, scope });
      onOpenChange(false);
    } else {
      setErrorMessage(res.message);
      // F32 Concurrency protection: se a série mudou (409), atualiza a prévia para o usuário reexaminar mantendo o alerta de conflito
      if (res.status === 409 && scope === "serie") {
        void fetchPreview(item.id, false);
      }
    }
  }

  if (!item) return null;

  const manualSeries = item.source === "manual" && item.inSeries === true;
  const isManual = item.source === "manual" && !manualSeries;
  const singleDate = isManual || dateOnly;
  const formattedShort = formatShortDate(item.date);
  const formattedLong = formatLongDate(item.date);

  const seriesDatesCount = previewDates?.length ?? 0;
  const isSeriesDisabled = scope === "serie" && (isLoadingPreview || previewDates === null);
  const seriesLabel = manualSeries ? "Cancelar esta e as próximas" : "Cancelar toda a série";

  const confirmLabel = dateOnly
    ? "Desmarcar esta data"
    : isManual
      ? "Cancelar reserva"
      : scope === "data"
        ? `Cancelar só ${formattedShort}`
        : previewDates !== null
          ? `${seriesLabel} (${seriesDatesCount})`
          : seriesLabel;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>Cancelar reserva</AlertDialogTitle>
          <p className="text-sm text-muted-foreground">
            {item.foreign === true
              ? "Reserva de outra pessoa. A pessoa responsável será avisada do cancelamento."
              : isManual
                ? "Reserva feita por você."
                : manualSeries
                  ? "Reserva feita por você, parte de uma série."
                  : "Aula importada do horário oficial. Você é a pessoa responsável."}
          </p>
        </AlertDialogHeader>

        <div className="grid gap-3 py-1">
          {errorMessage && (
            <Notice tone="error" role="alert" className="flex items-start gap-2">
              <AlertCircle className="size-4 shrink-0 text-destructive mt-0.5" />
              <span>{errorMessage}</span>
            </Notice>
          )}

          {/* Resumo da Ocupação */}
          <div className="grid gap-1.5 rounded-xl border border-border bg-surface p-3.5 text-sm">
            <b className="font-semibold text-foreground text-base">{item.title}</b>
            <span className="text-muted-foreground flex items-center gap-2">
              <DoorClosed className="size-4 text-muted-foreground/80" />
              {item.spaceName}
            </span>
            <span className="text-muted-foreground flex items-center gap-2">
              <Calendar className="size-4 text-muted-foreground/80" />
              {formattedLong}
            </span>
            <span className="text-muted-foreground flex items-center gap-2 tabular-nums">
              <Clock className="size-4 text-muted-foreground/80" />
              {item.start}–{item.end}
            </span>
          </div>

          {/* Opções de Escopo */}
          {singleDate ? (
            <p className="text-sm text-muted-foreground">
              {dateOnly ? "Desmarcar esta aula em " : "Cancelar esta reserva em "}
              <b>{formattedShort}</b>? Isso libera a sala para outras pessoas.
            </p>
          ) : (
            <fieldset className="grid gap-2 border-0 p-0 m-0 min-w-0">
              <legend className="text-sm font-semibold text-foreground mb-1">
                O que cancelar?
              </legend>
              <ChoiceCard
                type="radio"
                name="cancel-scope"
                value="data"
                checked={scope === "data"}
                onChange={() => handleScopeChange("data")}
                title={
                  manualSeries ? `Somente esta (${formattedShort})` : `Somente ${formattedShort}`
                }
                description="As demais datas continuam valendo."
              />
              <ChoiceCard
                type="radio"
                name="cancel-scope"
                value="serie"
                checked={scope === "serie"}
                onChange={() => handleScopeChange("serie")}
                title={manualSeries ? "Esta e as próximas" : "Toda a série a partir de hoje"}
                description={
                  manualSeries
                    ? "Esta data e as seguintes desta série de reservas."
                    : "Todas as ocorrências semanais desta aula de hoje em diante."
                }
              />

              {/* Prévia da Série */}
              {scope === "serie" && (
                <div
                  className="mt-1 rounded-xl border border-border bg-surface-2 p-3 text-sm grid gap-2"
                  data-testid="series-preview-box"
                >
                  {isLoadingPreview ? (
                    <div className="flex items-center gap-2 text-muted-foreground py-2 justify-center">
                      <Loader2 className="size-4 animate-spin" />
                      <span>Buscando datas futuras da série…</span>
                    </div>
                  ) : previewDates !== null ? (
                    <>
                      <p className="font-semibold text-foreground">
                        {seriesDatesCount === 1
                          ? "1 data será cancelada:"
                          : `${seriesDatesCount} datas serão canceladas:`}
                      </p>
                      <div className="max-h-32 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 gap-1.5 pt-1">
                        {previewDates.map((d) => (
                          <span
                            key={d}
                            className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-1 text-xs font-medium text-foreground tabular-nums"
                          >
                            <Calendar className="size-3 text-muted-foreground" />
                            {formatShortDate(d)}
                          </span>
                        ))}
                      </div>
                    </>
                  ) : null}
                </div>
              )}
            </fieldset>
          )}
        </div>

        {item.foreign === true && (
          <div className="grid gap-2">
            <Label htmlFor="cancel-note">Motivo (opcional, enviado ao responsável)</Label>
            <Textarea
              id="cancel-note"
              maxLength={300}
              value={note}
              disabled={isSubmitting}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
        )}

        <AlertDialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={isSubmitting}
            onClick={() => onOpenChange(false)}
          >
            Voltar
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={isSubmitting || isSeriesDisabled}
            onClick={handleConfirm}
          >
            {isSubmitting ? "Cancelando…" : confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
