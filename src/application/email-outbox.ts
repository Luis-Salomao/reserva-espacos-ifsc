import type { EmailPayloadCodec, EmailSender, OutboxRepository } from "./email-ports";

export type DrainResult = { sent: number; failed: number };

/** Uma rodada limitada, própria para cron e Scheduled Handler. Falhas nunca expõem payloads. */
export function createOutboxProcessor(deps: {
  outbox: OutboxRepository;
  codec: EmailPayloadCodec;
  sender: EmailSender;
  now?: () => Date;
}) {
  const clock = deps.now ?? (() => new Date());
  return {
    async drain(limit = 50): Promise<DrainResult> {
      const result = { sent: 0, failed: 0 };
      await deps.outbox.cleanup(clock().toISOString());
      for (let i = 0; i < Math.max(0, Math.min(limit, 100)); i++) {
        const now = clock();
        const lease = await deps.outbox.claim(
          now.toISOString(),
          new Date(now.getTime() + 60_000).toISOString(),
          crypto.randomUUID(),
        );
        if (lease === null) break;
        try {
          const message = await deps.codec.open(lease.payload);
          if (clock().toISOString() >= lease.expiresAt) {
            await deps.outbox.cleanup(clock().toISOString());
            continue;
          }
          await deps.sender.send(message, lease.id);
          if (await deps.outbox.sent(lease.id, lease.token, clock().toISOString())) result.sent++;
        } catch {
          const failedAt = clock();
          const delay = Math.min(60_000 * 2 ** (lease.attempts - 1), 60 * 60_000);
          if (
            await deps.outbox.retry(
              lease.id,
              lease.token,
              failedAt.toISOString(),
              new Date(failedAt.getTime() + delay).toISOString(),
            )
          )
            result.failed++;
        }
      }
      return result;
    },
  };
}
