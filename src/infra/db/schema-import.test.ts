import { describe, expect, test } from "bun:test";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import * as schema from "#/infra/db/schema";

function targets(table: Parameters<typeof getTableConfig>[0]) {
  return getTableConfig(table).foreignKeys.map((fk) => ({
    table: getTableConfig(fk.reference().foreignTable).name,
    onDelete: fk.onDelete,
  }));
}

describe("esquema da importação", () => {
  test("vínculos apontam para espaços e contas", () => {
    expect(targets(schema.roomMappings)).toEqual([{ table: "spaces", onDelete: undefined }]);
    expect(targets(schema.teacherMappings)).toEqual([{ table: "users", onDelete: undefined }]);
  });

  test("lote, linhas e ocupações se ligam; linhas apagam junto do lote", () => {
    expect(targets(schema.importBatches).map((fk) => fk.table)).toEqual(["semesters", "users"]);
    expect(targets(schema.importRows)).toEqual([{ table: "import_batches", onDelete: "cascade" }]);
    expect(targets(schema.occupations).map((fk) => fk.table)).toEqual([
      "spaces",
      "import_batches",
      "users",
      "users",
    ]);
  });

  test("índices: hash único por semestre e chave única da ocupação importada", () => {
    const names = (table: Parameters<typeof getTableConfig>[0]) =>
      getTableConfig(table).indexes.map((index) => `${index.config.unique}:${index.config.name}`);
    expect(names(schema.importBatches)).toEqual(["true:import_batches_hash_semester_unique"]);
    expect(names(schema.occupations)).toEqual([
      "false:occupations_space_starts_idx",
      "false:occupations_series_idx",
      "false:occupations_created_by_idx",
      "false:occupations_responsible_idx",
      "false:occupations_space_ends_idx",
      "true:occupations_import_unique",
    ]);
  });
});
