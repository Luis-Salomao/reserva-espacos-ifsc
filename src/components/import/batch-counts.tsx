import { Card } from "#/components/page";
import type { ImportSummary } from "#/domain/import-batch";
import { describeReason } from "#/domain/import-reasons";
import { STATUS_LABELS, STATUS_ORDER, STATUS_TONE, VERSION_STATUS_ORDER } from "./flow-helpers";

/** Contagens do lote por estado e, nas não aplicáveis, por motivo. O texto acompanha toda cor. */
export function BatchCounts({ summary }: { summary: ImportSummary }) {
  const reasons = Object.entries(summary.notApplicable).sort((a, b) => b[1] - a[1]);
  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">
        {summary.rows} {summary.rows === 1 ? "linha" : "linhas"} no lote.
      </p>
      {summary.version === undefined &&
        summary.rows > 0 &&
        summary.counts.aplicada === 0 &&
        summary.counts.pendente === 0 &&
        summary.counts.nao_aplicavel > 0 && (
          <p
            role="status"
            className="rounded-lg border border-line-conflict bg-occ-conflict p-3 text-sm"
          >
            Nenhuma ocupação pode ser aplicada neste lote. Confira os motivos abaixo, especialmente
            salas sem vínculo e durações sem datas. A prévia do XML conta horários encontrados no
            arquivo; ela não confirma, por si só, o vínculo com espaços do IFSC.
          </p>
        )}
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {[...STATUS_ORDER, ...(summary.version === undefined ? [] : VERSION_STATUS_ORDER)].map(
          (status) => (
            <Card key={status} compact tone={STATUS_TONE[status]} className="shadow-none">
              <dt className="text-sm">{STATUS_LABELS[status]}</dt>
              <dd className="text-xl font-semibold">{summary.counts[status]}</dd>
            </Card>
          ),
        )}
      </dl>
      {reasons.length > 0 && (
        <div className="grid gap-1">
          <h3 className="text-sm font-medium">Não aplicáveis, por motivo</h3>
          <ul className="grid gap-1 text-sm">
            {reasons.map(([code, count]) => (
              <li key={code}>
                <Card compact className="flex justify-between gap-4 py-2 shadow-none">
                  <span className="break-words">{describeReason(code, null).label}</span>
                  <span className="font-medium">{count}</span>
                </Card>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
