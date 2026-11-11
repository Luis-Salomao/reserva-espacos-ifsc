import { useState } from "react";
import type { BookingView } from "#/application/bookings";
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
import { updateBookingFn } from "#/server/booking-fns";

type Target = BookingView & { inSeries: boolean };
type EditInput = {
  occupationId: string;
  spaceId: string;
  date: string;
  start: string;
  end: string;
  purpose: string;
};

export function EditBookingDialog({
  open,
  onOpenChange,
  target,
  spaces,
  onSaved,
  saveFn = updateBookingFn,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: Target;
  spaces: Space[];
  onSaved: () => void;
  saveFn?: (input: { data: EditInput }) => Promise<AdminResponse<BookingView>>;
}) {
  const [spaceId, setSpaceId] = useState(target.spaceId);
  const [date, setDate] = useState(target.date);
  const [start, setStart] = useState(target.start);
  const [end, setEnd] = useState(target.end);
  const [purpose, setPurpose] = useState(target.title);
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
              ? "Somente esta ocorrência será alterada."
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
              onChange={(e) => setSpaceId(e.target.value)}
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
              onChange={(e) => setDate(e.target.value)}
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
                onChange={(e) => setStart(e.target.value)}
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
                onChange={(e) => setEnd(e.target.value)}
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
              onChange={(e) => setPurpose(e.target.value)}
            />
          </div>
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
              {busy ? "Salvando…" : "Salvar alterações"}
            </Button>
          </div>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
