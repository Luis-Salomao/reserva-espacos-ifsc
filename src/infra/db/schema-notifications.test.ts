import { describe, expect, test } from "bun:test";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import { notifications, roomRequests } from "#/infra/db/schema";

function foreignTargets(table: Parameters<typeof getTableConfig>[0]) {
  return getTableConfig(table).foreignKeys.map((fk) => ({
    column: fk.reference().columns.map((column) => column.name)[0],
    table: getTableConfig(fk.reference().foreignTable).name,
  }));
}

describe("esquema de avisos e pedidos", () => {
  test("pedidos apontam para quem pediu e para o dono (usuários)", () => {
    expect(foreignTargets(roomRequests)).toEqual([
      { column: "requester_id", table: "users" },
      { column: "owner_id", table: "users" },
    ]);
  });

  test("avisos apontam para o destinatário e para quem agiu (usuários)", () => {
    expect(foreignTargets(notifications)).toEqual([
      { column: "user_id", table: "users" },
      { column: "actor_id", table: "users" },
    ]);
  });

  test("há índice único parcial dos pedidos pendentes e índice dos avisos por pessoa", () => {
    const requestIndexes = getTableConfig(roomRequests).indexes.map((index) => ({
      name: index.config.name,
      unique: index.config.unique,
      partial: index.config.where !== undefined,
    }));
    expect(requestIndexes).toContainEqual({
      name: "room_requests_pending_unique",
      unique: true,
      partial: true,
    });
    expect(getTableConfig(notifications).indexes.map((index) => index.config.name)).toEqual([
      "notifications_user_idx",
    ]);
  });
});
