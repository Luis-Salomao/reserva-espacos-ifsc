import { useState } from "react";
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
import { Textarea } from "#/components/ui/textarea";
import type { AdminResponse } from "#/server/admin-actions";
import { requestRoomFn } from "#/server/notification-fns";

export type RequestTarget = {
  id: string;
  spaceName: string;
  /** "YYYY-MM-DD". */
  date: string;
  start: string;
  end: string;
};

type RequestInput = { data: { occupationId: string; purpose: string; message?: string } };

export type RequestRoomDialogProps = {
  target: RequestTarget | null;
  onOpenChange: (open: boolean) => void;
  /** Pedido enviado: quem abriu o diálogo mostra a confirmação. */
  onSent: () => void;
  requestFn?: (input: RequestInput) => Promise<AdminResponse<{ id: string }>>;
};

function shortDate(date: string): string {
  const [, month = "", day = ""] = date.split("-");
  return `${day}/${month}`;
}

/** Pede a sala ocupada por outra pessoa, para esta data e horário (finalidade obrigatória). */
export function RequestRoomDialog({
  target,
  onOpenChange,
  onSent,
  requestFn = requestRoomFn as NonNullable<RequestRoomDialogProps["requestFn"]>,
}: RequestRoomDialogProps) {
  const [purpose, setPurpose] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close(open: boolean) {
    if (busy) return;
    if (!open) {
      setPurpose("");
      setMessage("");
      setError(null);
    }
    onOpenChange(open);
  }

  return (
    <AlertDialog open={target !== null} onOpenChange={close}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Pedir esta sala</AlertDialogTitle>
          <AlertDialogDescription>
            {target === null
              ? ""
              : `${target.spaceName} em ${shortDate(target.date)}, das ${target.start} às ${target.end}. A pessoa responsável decide se cede a sala.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <form
          className="grid gap-4"
          onSubmit={async (event) => {
            event.preventDefault();
            if (busy || target === null) return;
            setBusy(true);
            setError(null);
            const result = await runAdminAction(() =>
              requestFn({
                data: {
                  occupationId: target.id,
                  purpose,
                  ...(message.trim() === "" ? {} : { message }),
                },
              }),
            );
            setBusy(false);
            if (!result.ok) {
              setError(result.message);
              return;
            }
            setPurpose("");
            setMessage("");
            onSent();
          }}
        >
          {error !== null && (
            <Notice tone="error" role="alert">
              {error}
            </Notice>
          )}
          <div className="grid gap-2">
            <Label htmlFor="request-purpose">Finalidade</Label>
            <Input
              id="request-purpose"
              required
              maxLength={120}
              value={purpose}
              disabled={busy}
              onChange={(event) => setPurpose(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="request-message">Mensagem (opcional)</Label>
            <Textarea
              id="request-message"
              maxLength={300}
              value={message}
              disabled={busy}
              onChange={(event) => setMessage(event.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={busy} onClick={() => close(false)}>
              Voltar
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Enviando..." : "Enviar pedido"}
            </Button>
          </div>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
