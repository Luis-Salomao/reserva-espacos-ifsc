import { getTableColumns, type SQL, sql } from "drizzle-orm";
import { occupations } from "#/infra/db/schema";

type ColumnKey = keyof typeof occupations.$inferInsert;

/** Valor de cada coluna de `occupations`, por nome. Coluna nova no esquema sem valor aqui não compila. */
export type OccupationValues = { [K in ColumnKey]-?: string | null };

/**
 * Lista do `SELECT` para `insert(occupations).select(...)` com os valores casados POR NOME.
 * O drizzle emite `INSERT INTO occupations (<todas as colunas na ordem do esquema>) SELECT ...`;
 * aqui a lista de valores segue a mesma ordem, derivada do esquema e não escrita à mão, então
 * acrescentar uma coluna (ou reordenar o esquema) não desloca nenhum valor.
 */
export function occupationSelectList(values: OccupationValues): SQL {
  const keys = Object.keys(getTableColumns(occupations)) as ColumnKey[];
  return sql.join(
    keys.map((key) => sql`${values[key]}`),
    sql`, `,
  );
}
