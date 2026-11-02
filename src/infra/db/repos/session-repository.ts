import { eq } from "drizzle-orm";
import type { SessionRepository } from "#/application/ports";
import type { AppDb } from "#/infra/db/client";
import { sessions } from "#/infra/db/schema";

export function createSessionRepository(db: AppDb): SessionRepository {
  return {
    async create(session) {
      await db.insert(sessions).values(session);
    },
    async findByTokenHash(tokenHash) {
      const [row] = await db
        .select()
        .from(sessions)
        .where(eq(sessions.tokenHash, tokenHash))
        .limit(1);
      return row ?? null;
    },
    async extend(id, input) {
      await db.update(sessions).set(input).where(eq(sessions.id, id));
    },
    async deleteByTokenHash(tokenHash) {
      await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
    },
    async revokeAllForUser(userId) {
      await db.delete(sessions).where(eq(sessions.userId, userId));
    },
  };
}
