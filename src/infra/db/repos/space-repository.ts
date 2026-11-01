import type { SpaceRepository } from "#/application/ports";
import type { AppDb } from "#/infra/db/client";
import { spaces } from "#/infra/db/schema";

// Sem db.transaction(): o código é compartilhado entre bun-sqlite (sync) e D1 (async).
export function createSpaceRepository(db: AppDb): SpaceRepository {
  return {
    async list() {
      const rows = await db
        .select({ id: spaces.id, name: spaces.name, capacity: spaces.capacity })
        .from(spaces)
        .orderBy(spaces.name);
      return rows;
    },
    async create(input) {
      const row = {
        id: crypto.randomUUID(),
        name: input.name,
        capacity: input.capacity,
        createdAt: new Date().toISOString(),
      };
      await db.insert(spaces).values(row);
      return { id: row.id, name: row.name, capacity: row.capacity };
    },
  };
}
