import type {
  Clock,
  NotificationRepository,
  RoomRequestRepository,
  RoomRequestRow,
} from "#/application/ports";
import { ok, type Result } from "#/application/validation";
import { localNow } from "#/domain/availability";
import { type NoticeKind, noticeText } from "#/domain/notification";
import { type EffectiveStatus, effectiveStatus } from "#/domain/room-request";
import type { User } from "#/domain/user";

const NOTICE_LIMIT = 30;
const OUTGOING_LIMIT = 20;

export type NoticeView = {
  id: string;
  kind: NoticeKind;
  text: string;
  createdAt: string;
  unread: boolean;
};

/** Pedido como a tela mostra (situação já com "não está mais disponível"). */
export type RequestView = {
  id: string;
  status: EffectiveStatus;
  purpose: string;
  message: string | null;
  decisionNote: string | null;
  spaceName: string;
  /** "YYYY-MM-DD". */
  date: string;
  start: string;
  end: string;
  requesterName: string;
  ownerName: string;
  createdAt: string;
};

export type NoticesOverview = {
  notices: NoticeView[];
  /** Pedidos pendentes que a pessoa pode aceitar ou recusar. */
  incoming: RequestView[];
  /** Pedidos feitos pela pessoa, do mais novo ao mais antigo. */
  outgoing: RequestView[];
};

export type NoticesDeps = {
  notifications: NotificationRepository;
  requests: RoomRequestRepository;
  clock: Clock;
  timeZone: string;
};

export function createNoticesService(deps: NoticesDeps) {
  const { notifications, requests, clock, timeZone } = deps;
  const nowLocal = () => localNow(clock.now(), timeZone);

  return {
    /** Avisos, pedidos recebidos e pedidos enviados da pessoa. */
    async overview(user: User): Promise<Result<NoticesOverview>> {
      const now = nowLocal();
      const [stored, incoming, outgoing] = await Promise.all([
        notifications.listFor(user.id, NOTICE_LIMIT),
        requests.listIncoming(user.id),
        requests.listOutgoing(user.id, OUTGOING_LIMIT),
      ]);
      const view = (row: RoomRequestRow): RequestView => ({
        id: row.id,
        status: effectiveStatus(
          row.status,
          { status: row.occupationStatus, endsAt: row.endsAt },
          now,
        ),
        purpose: row.purpose,
        message: row.message,
        decisionNote: row.decisionNote,
        spaceName: row.spaceName,
        date: row.startsAt.slice(0, 10),
        start: row.startsAt.slice(11, 16),
        end: row.endsAt.slice(11, 16),
        requesterName: row.requesterName,
        ownerName: row.ownerName,
        createdAt: row.createdAt,
      });
      return ok({
        notices: stored.map((item) => ({
          id: item.id,
          kind: item.kind,
          text: noticeText(item.kind, item.data),
          createdAt: item.createdAt,
          unread: item.readAt === null,
        })),
        incoming: incoming.map(view).filter((item) => item.status === "pendente"),
        outgoing: outgoing.map(view),
      });
    },

    /** Marca todos os avisos da pessoa como lidos. */
    async markRead(user: User): Promise<Result<Record<string, never>>> {
      await notifications.markAllRead(user.id, clock.now().toISOString());
      return ok({});
    },

    /** Número do selo do menu: avisos não lidos mais pedidos recebidos esperando resposta. */
    async badge(user: User): Promise<number> {
      const [unread, pending] = await Promise.all([
        notifications.unreadCount(user.id),
        requests.countPendingIncoming(user.id, nowLocal()),
      ]);
      return unread + pending;
    },
  };
}

export type NoticesService = ReturnType<typeof createNoticesService>;
