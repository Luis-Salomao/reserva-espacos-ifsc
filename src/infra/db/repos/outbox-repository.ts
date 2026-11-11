import { and, eq, lte, sql } from "drizzle-orm";
import type { OutboxRepository } from "#/application/email-ports";
import type { AppDb } from "#/infra/db/client";
import { mailOutbox } from "#/infra/db/schema-email";

const MAX_ATTEMPTS = 5;
/** Resend guarda idempotência por 24h; nunca repetir envios após 23h da criação. */
const MAX_AGE_MS = 23 * 60 * 60 * 1000;
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const owned = (id: string, token: string) =>
  and(eq(mailOutbox.id, id), eq(mailOutbox.status, "sending"), eq(mailOutbox.leaseToken, token));

export function createOutboxRepository(db: AppDb): OutboxRepository {
  return {
    async enqueue(write) {
      await db.insert(mailOutbox).values(write);
    },
    async claim(now, leaseUntil, token) {
      const oldest = new Date(new Date(now).getTime() - MAX_AGE_MS).toISOString();
      const [row] = await db
        .update(mailOutbox)
        .set({
          status: "sending",
          leaseToken: token,
          leaseUntil,
          attempts: sql`${mailOutbox.attempts} + 1`,
        })
        .where(
          eq(
            mailOutbox.id,
            sql`(select id from mail_outbox where payload is not null
          and expires_at > ${now} and created_at > ${oldest} and attempts < ${MAX_ATTEMPTS}
          and ((status = 'pending' and next_attempt_at <= ${now}) or (status = 'sending' and lease_until <= ${now}))
          order by created_at, id limit 1)`,
          ),
        )
        .returning();
      if (!row || row.payload === null) return null;
      return {
        id: row.id,
        payload: row.payload,
        createdAt: row.createdAt,
        expiresAt: row.expiresAt,
        token,
        attempts: row.attempts,
      };
    },
    async sent(id, token, now) {
      const changed = await db
        .update(mailOutbox)
        .set({
          status: "sent",
          payload: null,
          leaseToken: null,
          leaseUntil: null,
          completedAt: now,
        })
        .where(owned(id, token))
        .returning({ id: mailOutbox.id });
      return changed.length === 1;
    },
    async retry(id, token, now, nextAttemptAt) {
      const changed = await db
        .update(mailOutbox)
        .set({
          status: sql`case when attempts >= ${MAX_ATTEMPTS} then 'failed' else 'pending' end`,
          payload: sql`case when attempts >= ${MAX_ATTEMPTS} then null else payload end`,
          completedAt: sql`case when attempts >= ${MAX_ATTEMPTS} then ${now} else null end`,
          leaseToken: null,
          leaseUntil: null,
          nextAttemptAt,
        })
        .where(owned(id, token))
        .returning({ id: mailOutbox.id });
      return changed.length === 1;
    },
    async cleanup(now) {
      const oldest = new Date(new Date(now).getTime() - MAX_AGE_MS).toISOString();
      await db
        .update(mailOutbox)
        .set({
          status: "expired",
          payload: null,
          leaseToken: null,
          leaseUntil: null,
          completedAt: now,
        })
        .where(
          sql`status in ('pending', 'sending') and (expires_at <= ${now} or created_at <= ${oldest} or (attempts >= ${MAX_ATTEMPTS} and (lease_until is null or lease_until <= ${now})))`,
        );
      const cutoff = new Date(new Date(now).getTime() - RETENTION_MS).toISOString();
      await db
        .delete(mailOutbox)
        .where(
          and(sql`status in ('sent', 'failed', 'expired')`, lte(mailOutbox.completedAt, cutoff)),
        );
    },
  };
}
