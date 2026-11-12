import { useState } from "react";
import type { BookingView, SeriesUpdateInput, SeriesUpdatePreview } from "#/application/bookings";
import { runAdminAction } from "#/components/admin/use-admin-action";
import { Notice } from "#/components/page";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "#/components/ui/alert-dialog";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import type { Space } from "#/domain/space";
import type { AdminResponse } from "#/server/admin-actions";
import {
  previewSeriesUpdateFn,
  updateBookingFn,
  updateSeriesBookingFn,
} from "#/server/booking-fns";

type Target = BookingView & { inSeries: boolean };
type EditInput = {
  occupationId: string;
  spaceId: string;
  date: string;
  start: string;
  end: string;
  purpose: string;
};
type SeriesInput = SeriesUpdateInput;

export function EditBookingDialog({
  open,
  onOpenChange,
  target,
  spaces,
  onSaved,
  saveFn = updateBookingFn,
  previewSeriesFn = previewSeriesUpdateFn,
  saveSeriesFn = updateSeriesBookingFn,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: Target;
  spaces: Space[];
  onSaved: () => void;
  saveFn?: (input: { data: EditInput }) => Promise<AdminResponse<BookingView>>;
  previewSeriesFn?: (input: { data: SeriesInput }) => Promise<AdminResponse<SeriesUpdatePreview>>;
  saveSeriesFn?: (input: {
    data: SeriesInput & { expectedCount: number; expectedRevision: string };
  }) => Promise<AdminResponse<{ updated: number; dates: string[] }>>;
}) {
  const [spaceId, setSpaceId] = useState(target.spaceId);
  const [date, setDate] = useState(target.date);
  const [start, setStart] = useState(target.start);
  const [end, setEnd] = useState(target.end);
  const [purpose, setPurpose] = useState(target.title);
  const [scope, setScope] = useState<"data" | "future" | "serie">("data");
  const [seriesPreview, setSeriesPreview] = useState<SeriesUpdatePreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <AlertDialog
      open={open}
      onOpenChange={(value) => {
        if (!busy) onOpenChange(value);
      }}
    >
      <AlertDialogContent className="max-h-[90dvh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>Editar reserva</AlertDialogTitle>
          <AlertDialogDescription>
            {target.inSeries
              ? "Escolha se altera uma ocorrência ou as próximas datas da série."
              : "Atualize a sala, data, horário e finalidade."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <form
          className="grid gap-4"
          onSubmit={async (event) => {
            event.preventDefault();
            if (busy) return;
            setBusy(true);
            setError(null);
            if (target.inSeries && scope !== "data") {
              const input: SeriesInput = {
                occupationId: target.id,
                spaceId,
                date,
                start,
                end,
                purpose,
                scope,
              };
              if (seriesPreview === null) {
                const result = await runAdminAction(() => previewSeriesFn({ data: input }));
                setBusy(false);
                if (!result.ok) {
                  setError(result.message);
                  return;
                }
                setSeriesPreview(result.data);
                return;
              }
              const result = await runAdminAction(() =>
                saveSeriesFn({
                  data: {
                    ...input,
                    expectedCount: seriesPreview.count,
                    expectedRevision: seriesPreview.revision,
                  },
                }),
              );
              setBusy(false);
              if (!result.ok) {
                setError(result.message);
                setSeriesPreview(null);
                return;
              }
              onSaved();
              return;
            }
            const result = await runAdminAction(() =>
              saveFn({ data: { occupationId: target.id, spaceId, date, start, end, purpose } }),
            );
            setBusy(false);
            if (!result.ok) {
              setError(result.message);
              return;
            }
            onSaved();
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="edit-space">Sala</Label>
            <select
              id="edit-space"
              value={spaceId}
              onChange={(e) => {
                setSpaceId(e.target.value);
                setSeriesPreview(null);
              }}
              disabled={busy}
              className="h-10 rounded-md border bg-background px-3"
            >
              {spaces.map((space) => (
                <option key={space.id} value={space.id}>
                  {space.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit-date">Data</Label>
            <Input
              id="edit-date"
              type="date"
              required
              value={date}
              disabled={busy}
              onChange={(e) => {
                setDate(e.target.value);
                setSeriesPreview(null);
              }}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="edit-start">Início</Label>
              <Input
                id="edit-start"
                type="time"
                required
                value={start}
                disabled={busy}
                onChange={(e) => {
                  setStart(e.target.value);
                  setSeriesPreview(null);
                }}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-end">Fim</Label>
              <Input
                id="edit-end"
                type="time"
                required
                value={end}
                disabled={busy}
                onChange={(e) => {
                  setEnd(e.target.value);
                  setSeriesPreview(null);
                }}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit-purpose">Finalidade</Label>
            <Input
              id="edit-purpose"
              required
              maxLength={120}
              value={purpose}
              disabled={busy}
              onChange={(e) => {
                setPurpose(e.target.value);
                setSeriesPreview(null);
              }}
            />
          </div>
          {target.inSeries && (
            <fieldset className="grid gap-2 border-0 p-0 m-0 min-w-0">
              <legend className="text-sm font-semibold text-foreground">
                Aplicar alterações a
              </legend>
              <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-border p-3 text-sm">
                <input
                  type="radio"
                  name="edit-series-scope"
                  value="data"
                  checked={scope === "data"}
                  disabled={busy}
                  onChange={() => {
                    setScope("data");
                    setSeriesPreview(null);
                  }}
                />
                <span>Somente esta ocorrência</span>
              </label>
              <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-border p-3 text-sm">
                <input
                  type="radio"
                  name="edit-series-scope"
                  value="future"
                  checked={scope === "future"}
                  disabled={busy}
                  onChange={() => {
                    setScope("future");
                    setSeriesPreview(null);
                  }}
                />
                <span>Esta e as próximas ocorrências</span>
              </label>
              <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-border p-3 text-sm">
                <input
                  type="radio"
                  name="edit-series-scope"
                  value="serie"
                  checked={scope === "serie"}
                  disabled={busy}
                  onChange={() => {
                    setScope("serie");
                    setSeriesPreview(null);
                  }}
                />
                <span>Todas as ocorrências futuras da série</span>
              </label>
              <p className="text-xs text-muted-foreground">
                {scope === "data"
                  ? "Só esta data será alterada."
                  : scope === "future"
                    ? "A data informada será a nova data desta ocorrência; as seguintes manterão o intervalo entre elas."
                    : "A data informada será a nova data desta ocorrência; as demais datas futuras serão deslocadas pelo mesmo número de dias."}{" "}
                Ocorrências canceladas são mantidas.
              </p>
            </fieldset>
          )}
          {seriesPreview && (
            <section
              aria-label="Prévia das alterações"
              data-testid="series-edit-preview"
              className="grid gap-2 rounded-xl border border-border bg-surface-2 p-3 text-sm"
            >
              <p className="font-semibold text-foreground">
                {seriesPreview.count}{" "}
                {seriesPreview.count === 1 ? "ocorrência será" : "ocorrências serão"} alterada
                {seriesPreview.count === 1 ? "" : "s"}.
              </p>
              <p className="text-muted-foreground">
                Confira o deslocamento das datas antes de confirmar:
              </p>
              <p className="font-medium text-foreground">
                {spaces.find((space) => space.id === spaceId)?.name ?? "Sala"} · {start}–{end} ·{" "}
                {purpose}
              </p>
              <ul className="grid max-h-36 gap-1 overflow-y-auto">
                {seriesPreview.changes.map((change) => (
                  <li key={`${change.from}-${change.to}`} className="tabular-nums">
                    {change.from} → {change.to}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {error && (
            <Notice tone="error" role="alert">
              {error}
            </Notice>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => onOpenChange(false)}
            >
              Voltar
            </Button>
            <Button type="submit" disabled={busy}>
              {busy
                ? seriesPreview === null && scope !== "data"
                  ? "Conferindo…"
                  : "Salvando…"
                : scope !== "data" && seriesPreview === null
                  ? "Revisar alterações"
                  : seriesPreview !== null
                    ? `Confirmar ${seriesPreview.count} ${seriesPreview.count === 1 ? "alteração" : "alterações"}`
                    : "Salvar alterações"}
            </Button>
          </div>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
