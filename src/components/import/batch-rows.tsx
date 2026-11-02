import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { BatchView, RowsPage } from "#/application/import-report";
import type { ReasonCount } from "#/application/ports";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import type { ImportChangeKind, ImportRowStatus } from "#/domain/import-batch";
import { describeReason } from "#/domain/import-reasons";
import type { AdminResponse } from "#/server/admin-actions";
import { AlterationList } from "./alteration-list";
import {
  CHANGE_KIND_LABELS,
  STATUS_LABELS,
  STATUS_ORDER,
  VERSION_STATUS_ORDER,
  type VersionView,
  viewFilter,
} from "./flow-helpers";
import { dayLabel, Reason, StatusPill } from "./row-parts";

export type RowsQuery = {
  batchId: string;
  status?: ImportRowStatus;
  reasonCode?: string;
  changeKind?: ImportChangeKind;
  /** Pagina por grupo (aula + data): `limit`, `offset` e o total contam grupos. */
  groups?: boolean;
  search?: string;
  limit: number;
  offset: number;
};

export type LoadRows = (query: RowsQuery) => Promise<AdminResponse<RowsPage>>;

const PAGE_SIZE = 25;
/** Visão de alterações: a página tem este tanto de GRUPOS (aula + data); um grupo nunca é cortado. */
const GROUPED_PAGE_SIZE = 25;
const SEARCH_DELAY_MS = 300;
const LOAD_ERROR = "Não foi possível carregar as linhas do lote. Tente novamente.";
const SELECT_CLASS =
  "h-9 w-full min-w-0 rounded-md border bg-background px-3 text-sm focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring outline-none";

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <td
      data-label={label}
      className="flex gap-2 px-3 py-1 before:w-24 before:shrink-0 before:text-xs before:font-medium before:text-muted-foreground before:content-[attr(data-label)] md:table-cell md:py-2 md:align-top md:before:hidden"
    >
      <div className="min-w-0 flex-1">{children}</div>
    </td>
  );
}

function reasonOptions(reasons: readonly ReasonCount[]): Array<[string, number]> {
  const totals = new Map<string, number>();
  for (const entry of reasons) {
    if (entry.reasonCode === null) continue;
    totals.set(entry.reasonCode, (totals.get(entry.reasonCode) ?? 0) + entry.total);
  }
  return [...totals.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

function statusTotals(reasons: readonly ReasonCount[]): Map<ImportRowStatus, number> {
  const totals = new Map<ImportRowStatus, number>();
  for (const entry of reasons)
    totals.set(entry.status, (totals.get(entry.status) ?? 0) + entry.total);
  return totals;
}

type Props = {
  batchId: string;
  load: LoadRows;
  /** Muda para recarregar (por exemplo, depois de aplicar). */
  refreshKey?: number;
  /** Tipo de mudança (nova versão) a mostrar; "" = todas as linhas. */
  view?: VersionView | "";
  /** Avisa quando o lote (com a lista de afetados) foi carregado. */
  onBatchLoaded?: (batch: BatchView) => void;
};

/**
 * Resultado por linha do lote: cada aula/ocorrência com seu estado (aplicada, não aplicável com
 * motivo, conflito com a ocupação que impediu, falha com mensagem). Filtros por estado e motivo,
 * busca por texto e paginação no servidor; vale também ao reabrir um lote antigo.
 */
export function BatchRows({ batchId, load, refreshKey = 0, view = "", onBatchLoaded }: Props) {
  const uid = useId();
  const [status, setStatus] = useState<ImportRowStatus | "">("");
  const [reasonCode, setReasonCode] = useState("");
  const [typed, setTyped] = useState("");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<RowsPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const latest = useRef(0);
  const grouped = view === "alteracao" || view === "bloqueada";
  const pageSize = grouped ? GROUPED_PAGE_SIZE : PAGE_SIZE;
  const viewQuery = useMemo(() => viewFilter(view), [view]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: voltar à primeira página ao trocar de visão
  useEffect(() => {
    setOffset(0);
  }, [view]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(typed);
      setOffset(0);
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [typed]);

  const fetchPage = useCallback(async () => {
    const ticket = ++latest.current;
    setLoading(true);
    const result = await load({
      batchId,
      ...viewQuery,
      ...(grouped ? { groups: true } : {}),
      ...(status === "" ? {} : { status }),
      ...(reasonCode === "" ? {} : { reasonCode }),
      ...(search.trim() === "" ? {} : { search: search.trim() }),
      limit: pageSize,
      offset,
    }).catch(() => null);
    if (ticket !== latest.current) return;
    setLoading(false);
    if (result?.ok) {
      setPage(result.data);
      setError(null);
      onBatchLoaded?.(result.data.batch);
    } else {
      setError(result === null ? LOAD_ERROR : result.message);
    }
  }, [
    batchId,
    load,
    status,
    reasonCode,
    search,
    offset,
    pageSize,
    grouped,
    viewQuery,
    onBatchLoaded,
  ]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshKey força recarregar
  useEffect(() => {
    void fetchPage();
  }, [fetchPage, refreshKey]);

  const totals = page === null ? new Map<ImportRowStatus, number>() : statusTotals(page.reasons);
  const reasons = page === null ? [] : reasonOptions(page.reasons);
  const total = page?.total ?? 0;
  const first = total === 0 ? 0 : offset + 1;
  const last = Math.min(offset + pageSize, total);
  const filtered = status !== "" || reasonCode !== "" || search.trim() !== "";

  return (
    <div className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="grid gap-1">
          <Label htmlFor={`${uid}-status`}>Estado</Label>
          <select
            id={`${uid}-status`}
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as ImportRowStatus | "");
              setOffset(0);
            }}
            className={SELECT_CLASS}
          >
            <option value="">Todos os estados</option>
            {[
              ...STATUS_ORDER,
              ...(page?.batch.summary.version === undefined ? [] : VERSION_STATUS_ORDER),
            ].map((item) => (
              <option key={item} value={item}>
                {STATUS_LABELS[item]} ({totals.get(item) ?? 0})
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1">
          <Label htmlFor={`${uid}-reason`}>Motivo</Label>
          <select
            id={`${uid}-reason`}
            value={reasonCode}
            onChange={(event) => {
              setReasonCode(event.target.value);
              setOffset(0);
            }}
            className={SELECT_CLASS}
          >
            <option value="">Todos os motivos</option>
            {reasons.map(([code, count]) => (
              <option key={code} value={code}>
                {describeReason(code, null).label} ({count})
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1">
          <Label htmlFor={`${uid}-search`}>Buscar por aula, turma ou sala</Label>
          <Input
            id={`${uid}-search`}
            type="search"
            value={typed}
            maxLength={100}
            onChange={(event) => setTyped(event.target.value)}
          />
        </div>
      </div>

      {error !== null && (
        <div role="alert" className="grid gap-2 rounded-lg border bg-occ-conflict p-4">
          <p>{error}</p>
          <Button variant="outline" className="justify-self-start" onClick={() => void fetchPage()}>
            Tentar de novo
          </Button>
        </div>
      )}

      <p className="text-sm text-muted-foreground" aria-live="polite">
        {loading && page === null
          ? "Carregando…"
          : total === 0
            ? filtered
              ? "Nenhuma linha com esses filtros."
              : "Este lote não tem linhas."
            : `Mostrando ${first}–${last} de ${total}${grouped ? (total === 1 ? " alteração" : " alterações") : ""}${filtered ? " (filtrado)" : ""}.`}
      </p>

      {page !== null && page.rows.length > 0 && grouped && (
        <div className={loading ? "opacity-60" : undefined}>
          <AlterationList rows={page.rows} />
        </div>
      )}

      {page !== null && page.rows.length > 0 && !grouped && (
        <div className={loading ? "opacity-60" : undefined}>
          <table className="block w-full text-sm md:table">
            <caption className="sr-only">Linhas do lote de importação</caption>
            <thead className="sr-only md:not-sr-only md:table-header-group">
              <tr className="text-left md:border-b">
                <th scope="col" className="px-3 py-2">
                  Dia/data
                </th>
                <th scope="col" className="px-3 py-2">
                  Horário
                </th>
                <th scope="col" className="px-3 py-2">
                  Sala
                </th>
                <th scope="col" className="px-3 py-2">
                  Aula
                </th>
                <th scope="col" className="px-3 py-2">
                  Responsável
                </th>
                <th scope="col" className="px-3 py-2">
                  Estado
                </th>
                <th scope="col" className="px-3 py-2">
                  Motivo / detalhe
                </th>
              </tr>
            </thead>
            <tbody className="block md:table-row-group">
              {page.rows.map((row) => (
                <tr
                  key={row.rowKey}
                  className="mb-2 block rounded-lg border bg-surface py-2 md:mb-0 md:table-row md:rounded-none md:border-0 md:border-b md:bg-transparent md:py-0"
                >
                  <Cell label="Dia/data">{dayLabel(row)}</Cell>
                  <Cell label="Horário">
                    {row.startTime}–{row.endTime}
                  </Cell>
                  <Cell label="Sala">{row.spaceName ?? "—"}</Cell>
                  <Cell label="Aula">
                    <span className="break-words">{row.title}</span>
                  </Cell>
                  <Cell label="Responsável">{row.responsibleName ?? "—"}</Cell>
                  <Cell label="Estado">
                    <StatusPill status={row.status} />
                    {row.changeKind !== null && (
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {CHANGE_KIND_LABELS[row.changeKind]}
                      </span>
                    )}
                  </Cell>
                  <Cell label="Motivo">
                    <Reason row={row} />
                  </Cell>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {total > pageSize && (
        <nav aria-label="Páginas" className="flex items-center justify-between gap-2">
          <Button
            variant="outline"
            disabled={offset === 0 || loading}
            onClick={() => setOffset(Math.max(offset - pageSize, 0))}
          >
            Anterior
          </Button>
          <span className="text-sm text-muted-foreground">
            Página {Math.floor(offset / pageSize) + 1} de {Math.ceil(total / pageSize)}
          </span>
          <Button
            variant="outline"
            disabled={offset + pageSize >= total || loading}
            onClick={() => setOffset(offset + pageSize)}
          >
            Próxima
          </Button>
        </nav>
      )}
    </div>
  );
}
