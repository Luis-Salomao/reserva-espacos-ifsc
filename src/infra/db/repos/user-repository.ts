import { and, eq, type SQL, sql } from "drizzle-orm";
import type { UserRecord, UserRepository } from "#/application/ports";
import { normalizeEmail, parseRoles, serializeRoles, type User } from "#/domain/user";
import { runAtomically } from "#/infra/db/atomic";
import type { AppDb } from "#/infra/db/client";
import {
  notifications,
  occupations,
  roomRequests,
  sessions,
  teacherMappings,
  users,
} from "#/infra/db/schema";

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
    placeholder: row.placeholder,
    passwordHash: row.passwordHash,
  };
}

/**
 * Condição de uma única instrução UPDATE que impede deixar o sistema sem admin ativo: vale se a
 * conta não é admin ativo ou se existe outro admin ativo. Atômica em bun-sqlite e em D1.
 */
function keepsAnActiveAdmin(id: string): SQL {
  const isAdmin = (roles: unknown) => sql`(',' || ${roles} || ',') LIKE '%,admin,%'`;
  return sql`(NOT (${users.active} = 1 AND ${isAdmin(users.roles)}) OR EXISTS (
    SELECT 1 FROM users AS other
    WHERE other.id <> ${id} AND other.active = 1 AND ${isAdmin(sql.raw("other.roles"))}))`;
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
      const removesAdmin = !input.roles.includes("admin");
      const rows = await db
        .update(users)
        .set({
          name: input.name,
          code: input.code,
          roles: serializeRoles(input.roles),
          updatedAt: new Date().toISOString(),
        })
        .where(removesAdmin ? and(eq(users.id, id), keepsAnActiveAdmin(id)) : eq(users.id, id))
        .returning({ id: users.id });
      return rows.length === 0 ? null : repo.findById(id);
    },
    async setActive(id, active) {
      const guard: SQL | undefined = active ? undefined : keepsAnActiveAdmin(id);
      const rows = await db
        .update(users)
        .set({ active, updatedAt: new Date().toISOString() })
        .where(guard === undefined ? eq(users.id, id) : and(eq(users.id, id), guard))
        .returning({ id: users.id });
      return rows.length > 0;
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
        placeholder: false,
        createdAt: now,
        updatedAt: now,
      };
      await db.insert(users).values(row);
      return toUser(row);
    },
    async updatePasswordHash(id, passwordHash) {
      await db
        .update(users)
        .set({ passwordHash, updatedAt: new Date().toISOString() })
        .where(eq(users.id, id));
    },
    async activatePlaceholder(id, email, passwordHash) {
      const rows = await db
        .update(users)
        .set({
          email: normalizeEmail(email),
          passwordHash,
          placeholder: false,
          updatedAt: new Date().toISOString(),
        })
        .where(and(eq(users.id, id), eq(users.placeholder, true)))
        .returning({ id: users.id });
      return rows.length > 0;
    },
    async mergeInto(fromId, toId) {
      // Repetida em cada instrução: a fantasma só some na última, então a condição vale para todas.
      const allowed = sql`(EXISTS (SELECT 1 FROM users f WHERE f.id = ${fromId} AND f.placeholder = 1)
        AND EXISTS (SELECT 1 FROM users t WHERE t.id = ${toId} AND t.placeholder = 0 AND t.active = 1))`;
      const [before] = await db.select({ id: users.id }).from(users).where(eq(users.id, fromId));
      if (before === undefined || fromId === toId) return false;
      await runAtomically(db, (x) => [
        x
          .update(occupations)
          .set({ responsibleUserId: toId })
          .where(and(eq(occupations.responsibleUserId, fromId), allowed)),
        x
          .update(occupations)
          .set({ createdBy: toId })
          .where(and(eq(occupations.createdBy, fromId), allowed)),
        x
          .update(teacherMappings)
          .set({ userId: toId })
          .where(and(eq(teacherMappings.userId, fromId), allowed)),
        x
          .update(notifications)
          .set({ userId: toId })
          .where(and(eq(notifications.userId, fromId), allowed)),
        x
          .update(notifications)
          .set({ actorId: toId })
          .where(and(eq(notifications.actorId, fromId), allowed)),
        x
          .update(roomRequests)
          .set({ requesterId: toId })
          .where(and(eq(roomRequests.requesterId, fromId), allowed)),
        x
          .update(roomRequests)
          .set({ ownerId: toId })
          .where(and(eq(roomRequests.ownerId, fromId), allowed)),
        x.delete(sessions).where(and(eq(sessions.userId, fromId), allowed)),
        x.delete(users).where(and(eq(users.id, fromId), allowed)),
      ]);
      const [after] = await db.select({ id: users.id }).from(users).where(eq(users.id, fromId));
      return after === undefined;
    },
  };
  return repo;
}
