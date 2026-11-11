import { and, eq, gt, isNull, lt, sql } from "drizzle-orm";
import type { PasswordRecoveryRepository } from "#/application/password-recovery-ports";
import { runAtomically } from "#/infra/db/atomic";
import type { AppDb } from "#/infra/db/client";
import { sessions, users } from "#/infra/db/schema";
import { mailOutbox } from "#/infra/db/schema-email";
import { passwordRecoveryRequests, passwordResets } from "#/infra/db/schema-password-reset";

export function createPasswordRecoveryRepository(db: AppDb): PasswordRecoveryRepository {
  return {
    async eligible(tokenHash, now) {
      const [row] = await db
        .select({ id: passwordResets.id })
        .from(passwordResets)
        .where(
          and(
            eq(passwordResets.tokenHash, tokenHash),
            isNull(passwordResets.consumedAt),
            gt(passwordResets.expiresAt, now),
            sql`EXISTS (SELECT 1 FROM users u WHERE u.id = ${passwordResets.userId} AND u.active = 1 AND u.placeholder = 0)`,
          ),
        )
        .limit(1);
      return row !== undefined;
    },
    async allowRequest(input) {
      await db
        .delete(passwordRecoveryRequests)
        .where(lt(passwordRecoveryRequests.createdAt, input.since));
      // Uma única instrução limita as duas dimensões inclusive sob concorrência SQLite/D1.
      const rows = await db
        .insert(passwordRecoveryRequests)
        .select(sql`SELECT ${input.id}, ${input.emailHash}, ${input.clientHash}, ${input.now}
        WHERE (SELECT count(*) FROM password_recovery_requests WHERE email_hash = ${input.emailHash} AND created_at >= ${input.since}) < 5
        AND (SELECT count(*) FROM password_recovery_requests WHERE client_hash = ${input.clientHash} AND created_at >= ${input.since}) < 20`)
        .returning({ id: passwordRecoveryRequests.id });
      return rows.length > 0;
    },
    async create(input) {
      await runAtomically(db, (x) => [
        x.insert(passwordResets).values({
          id: input.id,
          userId: input.userId,
          tokenHash: input.tokenHash,
          createdAt: input.createdAt,
          expiresAt: input.expiresAt,
        }),
        x.insert(mailOutbox).values(input.mail),
      ]);
    },
    async consume(input) {
      const claimedUser = sql`(SELECT user_id FROM password_resets WHERE claim_id = ${input.claimId})`;
      await runAtomically(db, (x) => [
        x
          .update(passwordResets)
          .set({ consumedAt: input.now, claimId: input.claimId })
          .where(
            and(
              eq(passwordResets.tokenHash, input.tokenHash),
              isNull(passwordResets.consumedAt),
              gt(passwordResets.expiresAt, input.now),
              sql`EXISTS (SELECT 1 FROM users u WHERE u.id = ${passwordResets.userId} AND u.active = 1 AND u.placeholder = 0)`,
            ),
          ),
        x
          .update(users)
          .set({ passwordHash: input.passwordHash, updatedAt: input.now })
          .where(sql`${users.id} = ${claimedUser}`),
        x.delete(sessions).where(sql`${sessions.userId} = ${claimedUser}`),
        x
          .update(passwordResets)
          .set({ consumedAt: input.now })
          .where(
            and(sql`${passwordResets.userId} = ${claimedUser}`, isNull(passwordResets.consumedAt)),
          ),
      ]);
      const [claimed] = await db
        .select({ id: passwordResets.id })
        .from(passwordResets)
        .where(eq(passwordResets.claimId, input.claimId));
      return claimed !== undefined;
    },
  };
}
