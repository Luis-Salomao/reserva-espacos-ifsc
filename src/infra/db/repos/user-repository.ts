import { eq } from "drizzle-orm";
import type { UserRecord, UserRepository } from "#/application/ports";
import { normalizeEmail, parseRoles, serializeRoles } from "#/domain/user";
import type { AppDb } from "#/infra/db/client";
import { users } from "#/infra/db/schema";

type Row = typeof users.$inferSelect;

function toRecord(row: Row): UserRecord {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    code: row.code,
    roles: parseRoles(row.roles),
    active: row.active,
    passwordHash: row.passwordHash,
  };
}

// Sem db.transaction(): o código é compartilhado entre bun-sqlite (sync) e D1 (async).
export function createUserRepository(db: AppDb): UserRepository {
  return {
    async findByEmail(email) {
      const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1);
      return row ? toRecord(row) : null;
    },
    async findById(id) {
      const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
      if (!row) return null;
      const { passwordHash: _omit, ...user } = toRecord(row);
      return user;
    },
    async create(input) {
      const now = new Date().toISOString();
      const row: Row = {
        id: crypto.randomUUID(),
        email: normalizeEmail(input.email),
        name: input.name,
        code: input.code,
        roles: serializeRoles(input.roles),
        passwordHash: input.passwordHash,
        active: true,
        createdAt: now,
        updatedAt: now,
      };
      await db.insert(users).values(row);
      return {
        id: row.id,
        email: row.email,
        name: row.name,
        code: row.code,
        roles: parseRoles(row.roles),
        active: true,
      };
    },
    async updatePasswordHash(id, passwordHash) {
      await db
        .update(users)
        .set({ passwordHash, updatedAt: new Date().toISOString() })
        .where(eq(users.id, id));
    },
  };
}
