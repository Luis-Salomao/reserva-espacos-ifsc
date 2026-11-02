import { and, count, eq, gte } from "drizzle-orm";
import type { LoginAttemptRepository } from "#/application/ports";
import type { AppDb } from "#/infra/db/client";
import { loginAttempts } from "#/infra/db/schema";

export function createLoginAttemptRepository(db: AppDb): LoginAttemptRepository {
  return {
    async record(input) {
      await db.insert(loginAttempts).values(input);
    },
    async countFailuresSince(email, since) {
      const [row] = await db
        .select({ total: count() })
        .from(loginAttempts)
        .where(
          and(
            eq(loginAttempts.email, email),
            eq(loginAttempts.success, false),
            gte(loginAttempts.attemptedAt, since),
          ),
        );
      return row?.total ?? 0;
    },
    async clearFailures(email) {
      await db
        .delete(loginAttempts)
        .where(and(eq(loginAttempts.email, email), eq(loginAttempts.success, false)));
    },
  };
}
