import { and, eq, notExists } from "drizzle-orm";
import type { SpaceRepository } from "#/application/ports";
import { isEquipmentKind, type SpaceEquipment } from "#/domain/equipment";
import type { Space } from "#/domain/space";
import { runAtomically, type Statement } from "#/infra/db/atomic";
import type { AppDb } from "#/infra/db/client";
import { importRows, occupations, roomMappings, spaceEquipment, spaces } from "#/infra/db/schema";

// Uma linha por INSERT: o D1 limita a 100 parâmetros por instrução.
function equipmentInserts(db: AppDb, spaceId: string, items: SpaceEquipment["items"]): Statement[] {
  return Object.entries(items).flatMap(([kind, quantity]) =>
    quantity === undefined ? [] : [db.insert(spaceEquipment).values({ spaceId, kind, quantity })],
  );
}

// Sem db.transaction() direto: o código é compartilhado entre bun-sqlite (sync) e D1 (async);
// gravações com equipamentos passam por runAtomically (batch no D1, transação no bun:sqlite).
export function createSpaceRepository(db: AppDb): SpaceRepository {
  /** Espaços com equipamentos, por nome; com `id`, só aquele espaço. */
  async function readWithEquipment(id?: string): Promise<Space[]> {
    const [rows, items] = await Promise.all([
      db
        .select({
          id: spaces.id,
          name: spaces.name,
          capacity: spaces.capacity,
          notes: spaces.equipmentNotes,
          computersInMaintenance: spaces.computersInMaintenance,
        })
        .from(spaces)
        .where(id === undefined ? undefined : eq(spaces.id, id))
        .orderBy(spaces.name),
      db
        .select()
        .from(spaceEquipment)
        .where(id === undefined ? undefined : eq(spaceEquipment.spaceId, id)),
    ]);
    const bySpace = new Map<string, SpaceEquipment["items"]>();
    for (const item of items) {
      if (!isEquipmentKind(item.kind)) continue;
      bySpace.set(item.spaceId, { ...bySpace.get(item.spaceId), [item.kind]: item.quantity });
    }
    return rows.map(
      (row): Space => ({
        id: row.id,
        name: row.name,
        capacity: row.capacity,
        equipment: {
          items: bySpace.get(row.id) ?? {},
          notes: row.notes,
          ...(row.computersInMaintenance === null
            ? {}
            : { computersInMaintenance: row.computersInMaintenance }),
        },
      }),
    );
  }

  return {
    async list() {
      const rows = await db
        .select({ id: spaces.id, name: spaces.name, capacity: spaces.capacity })
        .from(spaces)
        .orderBy(spaces.name);
      return rows;
    },
    listWithEquipment() {
      return readWithEquipment();
    },
    async create(input) {
      const row = {
        id: crypto.randomUUID(),
        name: input.name,
        capacity: input.capacity,
        createdAt: new Date().toISOString(),
      };
      const space: Space = { id: row.id, name: row.name, capacity: row.capacity };
      if (input.equipment === undefined) {
        await db.insert(spaces).values(row);
        return space;
      }
      const maintenance = input.equipment.computersInMaintenance ?? null;
      const equipment = {
        items: input.equipment.items ?? {},
        notes: input.equipment.notes ?? null,
        ...(maintenance === null ? {} : { computersInMaintenance: maintenance }),
      };
      await runAtomically(db, (x) => [
        x.insert(spaces).values({
          ...row,
          equipmentNotes: equipment.notes,
          computersInMaintenance: maintenance,
        }),
        ...equipmentInserts(x, row.id, equipment.items),
      ]);
      return { ...space, equipment };
    },
    async update(id, input) {
      const { equipment } = input;
      if (equipment === undefined) {
        const [row] = await db
          .update(spaces)
          .set({ name: input.name, capacity: input.capacity })
          .where(eq(spaces.id, id))
          .returning({ id: spaces.id, name: spaces.name, capacity: spaces.capacity });
        return row ?? null;
      }
      const [existing] = await db.select({ id: spaces.id }).from(spaces).where(eq(spaces.id, id));
      if (existing === undefined) return null;
      const { items, notes, computersInMaintenance } = equipment;
      await runAtomically(db, (x) => [
        x
          .update(spaces)
          .set({
            name: input.name,
            capacity: input.capacity,
            ...(notes === undefined ? {} : { equipmentNotes: notes }),
            ...(computersInMaintenance === undefined ? {} : { computersInMaintenance }),
          })
          .where(eq(spaces.id, id)),
        ...(items === undefined
          ? []
          : [
              x.delete(spaceEquipment).where(eq(spaceEquipment.spaceId, id)),
              ...equipmentInserts(x, id, items),
            ]),
      ]);
      const [updated] = await readWithEquipment(id);
      return updated ?? null;
    },
    async remove(id) {
      const exists = async () =>
        (await db.select({ id: spaces.id }).from(spaces).where(eq(spaces.id, id))).length > 0;
      if (!(await exists())) return "not_found";
      await runAtomically(db, (x) => {
        const unused = and(
          notExists(
            x.select({ id: occupations.id }).from(occupations).where(eq(occupations.spaceId, id)),
          ),
          notExists(
            x
              .select({ id: roomMappings.sourceRoomId })
              .from(roomMappings)
              .where(eq(roomMappings.spaceId, id)),
          ),
          notExists(
            x.select({ id: importRows.rowKey }).from(importRows).where(eq(importRows.spaceId, id)),
          ),
        );
        return [
          x.delete(spaceEquipment).where(and(eq(spaceEquipment.spaceId, id), unused)),
          x.delete(spaces).where(and(eq(spaces.id, id), unused)),
        ];
      });
      return (await exists()) ? "in_use" : "removed";
    },
  };
}
