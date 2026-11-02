import { eq } from "drizzle-orm";
import type { UserRecord, UserRepository } from "#/application/ports";
import { normalizeEmail, parseRoles, serializeRoles, type User } from "#/domain/user";
import type { AppDb } from "#/infra/db/client";
import { users } from "#/infra/db/schema";

type Row = typeof users.$inferSelect;

function toUser(row: Row): User {
  const { passwordHash: _omit, ...user } = toRecord(row);
  return user;
}

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
  const repo: UserRepository = {
    async findByEmail(email) {
      const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1);
      return row ? toRecord(row) : null;
    },
    async findById(id) {
      const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
      return row ? toUser(row) : null;
    },
    async findByCode(code) {
      const [row] = await db.select().from(users).where(eq(users.code, code)).limit(1);
      return row ? toUser(row) : null;
    },
    async list() {
      const rows = await db.select().from(users).orderBy(users.name, users.email);
      return rows.map(toUser);
    },
    async update(id, input) {
      await db
        .update(users)
        .set({
          name: input.name,
          code: input.code,
          roles: serializeRoles(input.roles),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(users.id, id));
      return repo.findById(id);
    },
    async setActive(id, active) {
      await db
        .update(users)
        .set({ active, updatedAt: new Date().toISOString() })
        .where(eq(users.id, id));
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
  return repo;
}
