import { eq } from "drizzle-orm";
import type { EmailPayloadCodec, OutboxWrite } from "#/application/email-ports";
import type { Clock } from "#/application/ports";
import type { AppDb } from "#/infra/db/client";
import { spaces, users } from "#/infra/db/schema";

type BookingEmailEvent = {
  kind: "created" | "updated" | "cancelled";
  userId: string | null;
  spaceId: string;
  title: string;
  slots: readonly { startsAt: string; endsAt: string }[];
  series?: boolean;
};
export type BookingEmailFactory = {
  prepare(event: BookingEmailEvent): Promise<OutboxWrite | null>;
};

/** Prepara a mensagem sem rede; a gravação será feita junto da alteração da reserva. */
export function createBookingEmailFactory(
  db: AppDb,
  config: {
    codec: EmailPayloadCodec;
    publicOrigin: string;
    clock: Clock;
  },
): BookingEmailFactory {
  return {
    async prepare(event) {
      if (event.userId === null) return null;
      const [user] = await db.select().from(users).where(eq(users.id, event.userId));
      if (!user?.active || user.placeholder) return null;
      const [space] = await db
        .select({ name: spaces.name })
        .from(spaces)
        .where(eq(spaces.id, event.spaceId));
      const action = { created: "confirmada", updated: "alterada", cancelled: "cancelada" }[
        event.kind
      ];
      const subject = `Reserva ${action}`;
      const detail =
        event.kind === "cancelled" && event.series
          ? "Uma ou mais ocorrências desta série foram canceladas. Confira as datas na agenda."
          : event.slots
              .map(
                (slot) =>
                  `${slot.startsAt.slice(0, 10)} · ${slot.startsAt.slice(11, 16)} às ${slot.endsAt.slice(11, 16)}`,
              )
              .join("\n");
      const text = `${subject}\n\n${event.title}\nSala: ${space?.name ?? event.spaceId}\n${detail}\n\nConsulte suas reservas: ${config.publicOrigin}/minhas-reservas`;
      const now = config.clock.now();
      return {
        id: crypto.randomUUID(),
        payload: await config.codec.seal({ to: user.email, subject, text }),
        createdAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + 23 * 60 * 60 * 1000).toISOString(),
      };
    },
  };
}
