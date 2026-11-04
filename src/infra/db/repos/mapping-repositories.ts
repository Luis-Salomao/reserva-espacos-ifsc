import { sql } from "drizzle-orm";
import type {
  NewPlaceholder,
  RoomMappingRepository,
  TeacherMappingRepository,
} from "#/application/ports";
import type { TeacherMapping } from "#/domain/import-batch";
import { normalizeEmail, serializeRoles } from "#/domain/user";
import { runAtomically, type Statement } from "#/infra/db/atomic";
import type { AppDb } from "#/infra/db/client";
import { roomMappings, teacherMappings, users } from "#/infra/db/schema";

/** Instruções por chamada de `runAtomically` (uma linha por instrução: o D1 limita 100 parâmetros). */
const STATEMENTS_PER_CALL = 50;

function upsertTeacher(x: AppDb, item: TeacherMapping, updatedAt: string): Statement {
  return x
    .insert(teacherMappings)
    .values({ ...item, updatedAt })
    .onConflictDoUpdate({
      target: teacherMappings.sourceTeacherId,
      set: {
        sourceShort: sql`excluded.source_short`,
        userId: sql`excluded.user_id`,
        updatedAt: sql`excluded.updated_at`,
      },
    });
}

function insertPlaceholder(x: AppDb, account: NewPlaceholder, at: string): Statement {
  return x.insert(users).values({
    id: account.id,
    email: normalizeEmail(account.email),
    name: account.name,
    code: account.code,
    roles: serializeRoles(["docente"]),
    passwordHash: account.passwordHash,
    active: true,
    placeholder: true,
    createdAt: at,
    updatedAt: at,
  });
}

export function createMappingRepositories(db: AppDb): {
  rooms: RoomMappingRepository;
  teachers: TeacherMappingRepository;
} {
  return {
    rooms: {
      async list() {
        const rows = await db.select().from(roomMappings);
        return rows.map(({ updatedAt: _omit, ...mapping }) => mapping);
      },
      async saveMany(items, updatedAt) {
        for (let index = 0; index < items.length; index += STATEMENTS_PER_CALL) {
          const group = items.slice(index, index + STATEMENTS_PER_CALL);
          const [first, ...rest] = group;
          if (first === undefined) continue;
          await runAtomically(db, (x) => {
            const upsert = (item: typeof first) =>
              x
                .insert(roomMappings)
                .values({ ...item, updatedAt })
                .onConflictDoUpdate({
                  target: roomMappings.sourceRoomId,
                  set: {
                    sourceShort: sql`excluded.source_short`,
                    spaceId: sql`excluded.space_id`,
                    ignored: sql`excluded.ignored`,
                    updatedAt: sql`excluded.updated_at`,
                  },
                });
            return [upsert(first), ...rest.map(upsert)];
          });
        }
      },
    },
    teachers: {
      async list() {
        const rows = await db.select().from(teacherMappings);
        return rows.map(({ updatedAt: _omit, ...mapping }) => mapping);
      },
      async saveMany(items, updatedAt) {
        for (let index = 0; index < items.length; index += STATEMENTS_PER_CALL) {
          const group = items.slice(index, index + STATEMENTS_PER_CALL);
          const [first, ...rest] = group;
          if (first === undefined) continue;
          await runAtomically(db, (x) => [
            upsertTeacher(x, first, updatedAt),
            ...rest.map((item) => upsertTeacher(x, item, updatedAt)),
          ]);
        }
      },
      // Uma só unidade (sem blocos): contas e vínculos do envio entram juntos ou nenhum entra.
      async saveWithPlaceholders(placeholders, mappings, at) {
        if (placeholders.length === 0 && mappings.length === 0) return;
        await runAtomically(db, (x) => {
          const [first, ...rest] = [
            ...placeholders.map((account) => insertPlaceholder(x, account, at)),
            ...mappings.map((item) => upsertTeacher(x, item, at)),
          ];
          if (first === undefined) throw new Error("Nada a gravar.");
          return [first, ...rest];
        });
      },
    },
  };
}
