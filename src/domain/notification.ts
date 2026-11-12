import { weekdayOf } from "#/domain/calendar";

export type NoticeKind =
  | "reserva_cancelada"
  | "pedido_recebido"
  | "pedido_aceito"
  | "pedido_recusado";

/** Cópia do texto no momento do aviso: continua legível mesmo que a ocupação mude depois. */
export type NoticeData = {
  spaceName: string;
  /** "YYYY-MM-DD". */
  date: string;
  start: string;
  end: string;
  title: string;
  /** Datas de uma série cancelada (a primeira é `date`). */
  count?: number;
  note?: string;
  /** Quem agiu (pede, aceita ou recusa). */
  actorName?: string;
  message?: string;
};

const WEEKDAYS = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"] as const;

function when(data: NoticeData): string {
  const [, month = "", day = ""] = data.date.split("-");
  return `${WEEKDAYS[weekdayOf(data.date)] ?? ""} ${day}/${month}`;
}

function reason(label: string, note: string | undefined): string {
  return note === undefined || note === "" ? "" : ` ${label}: ${note}`;
}

/** Frase em pt-BR do aviso. */
export function noticeText(kind: NoticeKind, data: NoticeData): string {
  const slot = `${data.spaceName} · ${when(data)} · ${data.start}–${data.end}`;
  const actor = data.actorName ?? "Alguém";
  switch (kind) {
    case "reserva_cancelada": {
      const many = data.count !== undefined && data.count > 1;
      const where = many
        ? `${data.spaceName} · ${data.count} datas a partir de ${when(data)} · ${data.start}–${data.end}`
        : slot;
      return `A administração cancelou sua reserva “${data.title}” (${where}).${reason("Motivo:", data.note)}`;
    }
    case "pedido_recebido":
      return `${actor} pediu a sala ${slot} para “${data.title}”.${reason("Mensagem:", data.message)}`;
    case "pedido_aceito":
      return `${actor} aceitou seu pedido: a sala ${slot} agora é sua, reservada como “${data.title}”.`;
    case "pedido_recusado":
      return `${actor} recusou seu pedido da sala ${slot}.${reason("Motivo:", data.note)}`;
  }
}
