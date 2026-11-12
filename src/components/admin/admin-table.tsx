import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "#/lib/utils";

export type SortState = { key: string; direction: "asc" | "desc" };

export type Column<T> = {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** Presente = coluna ordenável; devolve o valor comparado. */
  sortValue?: (row: T) => string | number;
  /** Classes do cabeçalho e da célula (o celular empilha as células; veja `AdminTable`). */
  headerClassName?: string;
  cellClassName?: string | ((row: T) => string);
  /** Cabeçalho só para leitor de tela (ex.: coluna de ações). */
  srOnlyHeader?: boolean;
};

type Props<T> = {
  /** Nome acessível da tabela (vira a legenda, oculta visualmente). */
  caption: string;
  rows: readonly T[];
  columns: readonly Column<T>[];
  rowKey: (row: T) => string;
  sort?: SortState | null;
  onSort?: (key: string) => void;
  className?: string;
};

const collator = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });

/** Próximo estado ao clicar no cabeçalho: coluna nova começa crescente; a mesma alterna. */
export function nextSort(current: SortState | null, key: string): SortState {
  if (current?.key === key) return { key, direction: current.direction === "asc" ? "desc" : "asc" };
  return { key, direction: "asc" };
}

/** Ordena uma cópia pela coluna ativa; sem ordenação, mantém a ordem recebida. */
export function sortRows<T>(
  rows: readonly T[],
  columns: readonly Column<T>[],
  sort: SortState | null,
): T[] {
  const sortValue = columns.find((column) => column.key === sort?.key)?.sortValue;
  if (sort === null || sortValue === undefined) return [...rows];
  const sign = sort.direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const left = sortValue(a);
    const right = sortValue(b);
    if (typeof left === "number" && typeof right === "number") return sign * (left - right);
    return sign * collator.compare(String(left), String(right));
  });
}

function ariaSort(
  column: { key: string; sortValue?: unknown },
  sort: SortState | null | undefined,
): "ascending" | "descending" | "none" | undefined {
  if (column.sortValue === undefined) return undefined;
  if (sort?.key !== column.key) return "none";
  return sort.direction === "asc" ? "ascending" : "descending";
}

/**
 * Tabela semântica das telas de administração. A partir de `md` é uma tabela compacta; abaixo
 * disso cada linha vira um bloco empilhado (cabeçalho oculto, células em bloco) para caber em
 * 375 px sem rolagem lateral. As classes de cada coluna decidem o que aparece em cada largura.
 */
export function AdminTable<T>({
  caption,
  rows,
  columns,
  rowKey,
  sort,
  onSort,
  className,
}: Props<T>) {
  return (
    <div className={cn("max-w-full overflow-hidden rounded-xl border bg-background", className)}>
      <table className="block w-full border-collapse text-left text-sm md:table md:table-fixed">
        <caption className="sr-only">{caption}</caption>
        <thead className="sr-only md:not-sr-only md:table-header-group">
          <tr className="bg-surface text-xs font-semibold text-muted-foreground">
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                aria-sort={ariaSort(column, sort)}
                className={cn(
                  "border-b px-3 py-2 font-semibold",
                  column.srOnlyHeader && "sr-only",
                  column.headerClassName,
                )}
              >
                {column.sortValue !== undefined && onSort !== undefined ? (
                  <button
                    type="button"
                    onClick={() => onSort(column.key)}
                    className="-mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5 font-semibold outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring"
                  >
                    {column.header}
                    {sort?.key !== column.key ? (
                      <ChevronsUpDown className="size-3.5 opacity-60" aria-hidden="true" />
                    ) : sort.direction === "asc" ? (
                      <ArrowUp className="size-3.5" aria-hidden="true" />
                    ) : (
                      <ArrowDown className="size-3.5" aria-hidden="true" />
                    )}
                  </button>
                ) : (
                  column.header
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="block md:table-row-group">
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 gap-y-0.5 border-b px-3 py-2.5 last:border-b-0 hover:bg-surface/60 md:table-row md:px-0 md:py-0"
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={cn(
                    "min-w-0 md:table-cell md:h-11 md:px-3 md:py-1.5 md:align-middle",
                    typeof column.cellClassName === "function"
                      ? column.cellClassName(row)
                      : column.cellClassName,
                  )}
                >
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
