import { sql } from "drizzle-orm";
import type { RoomMappingRepository, TeacherMappingRepository } from "#/application/ports";
import { runAtomically } from "#/infra/db/atomic";
import type { AppDb } from "#/infra/db/client";
import { roomMappings, teacherMappings } from "#/infra/db/schema";

/** Instruções por chamada de `runAtomically` (uma linha por instrução: o D1 limita 100 parâmetros). */
const STATEMENTS_PER_CALL = 50;

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
          await runAtomically(db, (x) => {
            const upsert = (item: typeof first) =>
              x
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
            return [upsert(first), ...rest.map(upsert)];
          });
        }
      },
    },
  };
}
