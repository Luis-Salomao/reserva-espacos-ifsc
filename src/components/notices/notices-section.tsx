import { Ban, CheckCircle2, Inbox, XCircle } from "lucide-react";
import { type ReactNode, useState } from "react";
import type { NoticesOverview, NoticeView, RequestView } from "#/application/notifications";
import { runAdminAction } from "#/components/admin/use-admin-action";
import { Avatar } from "#/components/avatar";
import { Tag, type TagTone } from "#/components/ds";
import { Notice } from "#/components/page";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "#/components/ui/alert-dialog";
import { Button } from "#/components/ui/button";
import { Label } from "#/components/ui/label";
import { Textarea } from "#/components/ui/textarea";
import { weekdayOf } from "#/domain/calendar";
import type { NoticeKind } from "#/domain/notification";
import type { EffectiveStatus } from "#/domain/room-request";
import type { AdminResponse } from "#/server/admin-actions";
import { acceptRequestFn, declineRequestFn, withdrawRequestFn } from "#/server/notification-fns";

const WEEKDAYS = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"] as const;
const NOTE_MAX = 300;

const STATUS_LABEL: Record<EffectiveStatus, string> = {
  pendente: "Aguardando",
  aceito: "Aceito",
  recusado: "Recusado",
  cancelado: "Cancelado",
  encerrado: "Encerrado",
  indisponivel: "Não está mais disponível",
};

const STATUS_TONE: Record<EffectiveStatus, TagTone> = {
  pendente: "booked",
  aceito: "neutral",
  recusado: "conflict",
  cancelado: "neutral",
  encerrado: "neutral",
  indisponivel: "neutral",
};

const KIND_ICON: Record<NoticeKind, typeof Inbox> = {
  reserva_cancelada: Ban,
  pedido_recebido: Inbox,
  pedido_aceito: CheckCircle2,
  pedido_recusado: XCircle,
};

type RequestInput = { data: { requestId: string; note?: string } };
type RequestFn = (input: RequestInput) => Promise<AdminResponse<unknown>>;

export type NoticesSectionProps = {
  overview: NoticesOverview;
  /** Depois de aceitar, recusar ou desistir: a página recarrega os dados. */
  onChanged: () => void;
  acceptFn?: RequestFn;
  declineFn?: RequestFn;
  withdrawFn?: RequestFn;
};

/** "qui 12/11 · 13:30–15:20". */
function slotText(item: Pick<RequestView, "date" | "start" | "end">): string {
  const [, month = "", day = ""] = item.date.split("-");
  return `${WEEKDAYS[weekdayOf(item.date)] ?? ""} ${day}/${month} · ${item.start}–${item.end}`;
}

function Card({ children, label }: { children: ReactNode; label: string }) {
  return (
    <li aria-label={label} className="rounded-xl border border-border bg-surface p-3.5">
      {children}
    </li>
  );
}

function NoticeItem({ item }: { item: NoticeView }) {
  const Icon = KIND_ICON[item.kind];
  return (
    <li
      data-unread={item.unread ? "true" : "false"}
      className={
        item.unread
          ? "flex items-start gap-3 rounded-xl border border-border bg-surface-2 p-3 text-sm"
          : "flex items-start gap-3 rounded-xl border border-border p-3 text-sm"
      }
    >
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <p className="min-w-0 flex-1">{item.text}</p>
      {item.unread && (
        <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brand-red">
          <span className="sr-only">Novo</span>
        </span>
      )}
    </li>
  );
}

function DeclineDialog({
  target,
  busy,
  onClose,
  onConfirm,
}: {
  target: RequestView | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: (note: string) => void;
}) {
  const [note, setNote] = useState("");
  return (
    <AlertDialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open && !busy) {
          setNote("");
          onClose();
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Recusar pedido</AlertDialogTitle>
          <AlertDialogDescription>
            {target === null
              ? ""
              : `${target.requesterName} será avisado(a) de que você manteve ${target.spaceName} em ${slotText(target)}.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="decline-note">Motivo (opcional, enviado a quem pediu)</Label>
          <Textarea
            id="decline-note"
            maxLength={NOTE_MAX}
            value={note}
            disabled={busy}
            onChange={(event) => setNote(event.target.value)}
          />
        </div>
        <AlertDialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => {
              setNote("");
              onClose();
            }}
          >
            Voltar
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={busy}
            onClick={() => onConfirm(note)}
          >
            {busy ? "Recusando…" : "Recusar pedido"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * "Avisos e pedidos": pedidos de sala que a pessoa recebeu (aceitar ou recusar), avisos
 * (cancelamento pela administração, respostas) e os pedidos que ela mesma fez. Some se vazia.
 */
export function NoticesSection({
  overview,
  onChanged,
  acceptFn = acceptRequestFn as RequestFn,
  declineFn = declineRequestFn as RequestFn,
  withdrawFn = withdrawRequestFn as RequestFn,
}: NoticesSectionProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [declining, setDeclining] = useState<RequestView | null>(null);
  // Confirmação da última ação: fica visível mesmo quando a seção esvazia (ex.: o único pedido aceito).
  const [done, setDone] = useState<string | null>(null);
  const { notices, incoming, outgoing } = overview;
  if (notices.length === 0 && incoming.length === 0 && outgoing.length === 0 && done === null)
    return null;

  async function run(id: string, call: () => Promise<AdminResponse<unknown>>, success: string) {
    setBusy(id);
    setError(null);
    setDone(null);
    const result = await runAdminAction(call);
    setBusy(null);
    if (!result.ok) setError(result.message);
    else {
      setDeclining(null);
      setDone(success);
    }
    // Mesmo em falha (ex.: pedido que mudou): recarrega para mostrar a situação atual.
    onChanged();
  }

  return (
    <section aria-labelledby="avisos-titulo" className="mb-6 grid max-w-[760px] gap-4">
      <h2 id="avisos-titulo" className="text-lg font-semibold tracking-tight">
        Avisos e pedidos
      </h2>
      {error !== null && (
        <Notice tone="error" role="alert">
          {error}
        </Notice>
      )}
      {done !== null && (
        <Notice tone="ok" role="status">
          {done}
        </Notice>
      )}

      {incoming.length > 0 && (
        <div className="grid gap-2">
          <h3 className="text-sm font-semibold">Pedidos para você</h3>
          <ul className="grid gap-2">
            {incoming.map((item) => (
              <Card key={item.id} label={`Pedido de ${item.requesterName}`}>
                <div className="flex items-start gap-3">
                  <Avatar name={item.requesterName} />
                  <div className="min-w-0 flex-1 grid gap-0.5 text-sm">
                    <p className="font-semibold">{item.requesterName} pediu esta sala</p>
                    <p className="text-muted-foreground">
                      {item.spaceName} · {slotText(item)}
                    </p>
                    <p>Finalidade: {item.purpose}</p>
                    {item.message !== null && (
                      <p className="text-muted-foreground">Mensagem: {item.message}</p>
                    )}
                  </div>
                </div>
                <div className="mt-3 flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy !== null}
                    aria-label={`Recusar pedido de ${item.requesterName}`}
                    onClick={() => setDeclining(item)}
                  >
                    Recusar…
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={busy !== null}
                    aria-label={`Aceitar pedido de ${item.requesterName} para ${item.spaceName}`}
                    onClick={() =>
                      void run(
                        item.id,
                        () => acceptFn({ data: { requestId: item.id } }),
                        `Você cedeu ${item.spaceName} (${slotText(item)}) para ${item.requesterName}.`,
                      )
                    }
                  >
                    {busy === item.id ? "Aceitando…" : "Aceitar"}
                  </Button>
                </div>
              </Card>
            ))}
          </ul>
        </div>
      )}

      {notices.length > 0 && (
        <div className="grid gap-2">
          <h3 className="text-sm font-semibold">Avisos</h3>
          <ul className="grid gap-2">
            {notices.map((item) => (
              <NoticeItem key={item.id} item={item} />
            ))}
          </ul>
        </div>
      )}

      {outgoing.length > 0 && (
        <div className="grid gap-2">
          <h3 className="text-sm font-semibold">Seus pedidos</h3>
          <ul className="grid gap-2">
            {outgoing.map((item) => (
              <Card key={item.id} label={`Seu pedido de ${item.spaceName}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 grid gap-0.5 text-sm">
                    <p className="font-semibold">
                      {item.spaceName} · {slotText(item)}
                    </p>
                    <p>Finalidade: {item.purpose}</p>
                    <p className="text-muted-foreground">Responsável: {item.ownerName}</p>
                    {item.decisionNote !== null && (
                      <p className="text-muted-foreground">Motivo: {item.decisionNote}</p>
                    )}
                  </div>
                  <Tag tone={STATUS_TONE[item.status]}>{STATUS_LABEL[item.status]}</Tag>
                </div>
                {item.status === "pendente" && (
                  <div className="mt-3 flex justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busy !== null}
                      aria-label={`Desistir do pedido de ${item.spaceName}`}
                      onClick={() =>
                        void run(
                          item.id,
                          () => withdrawFn({ data: { requestId: item.id } }),
                          "Pedido retirado.",
                        )
                      }
                    >
                      Desistir
                    </Button>
                  </div>
                )}
              </Card>
            ))}
          </ul>
        </div>
      )}

      <DeclineDialog
        key={declining?.id ?? "none"}
        target={declining}
        busy={busy !== null}
        onClose={() => setDeclining(null)}
        onConfirm={(note) => {
          if (declining === null) return;
          const requestId = declining.id;
          const name = declining.requesterName;
          void run(
            requestId,
            () => declineFn({ data: { requestId, ...(note.trim() === "" ? {} : { note }) } }),
            `Pedido de ${name} recusado.`,
          );
        }}
      />
    </section>
  );
}
