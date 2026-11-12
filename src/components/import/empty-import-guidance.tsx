import { Callout } from "#/components/page";
import { Button } from "#/components/ui/button";
import type { ImportSummary } from "#/domain/import-batch";
import { describeReason } from "#/domain/import-reasons";

const NEXT_STEP: Record<string, string> = {
  no_room:
    "O XML não informa uma sala. Corrija o horário no aSc se souber o espaço correto; o sistema não consegue inferi-lo.",
  multiple_rooms:
    "O XML associa várias salas à mesma aula. Confirme a atribuição na origem; o sistema não escolhe uma delas automaticamente.",
  room_unmapped:
    "Vincule a sala do arquivo a um espaço do IFSC na etapa Salas, conferindo se os nomes correspondem.",
  room_ignored:
    "A sala foi marcada para ignorar. Revise a escolha na etapa Salas se ela deveria ser importada.",
  term_without_dates:
    "Configure as datas das durações no semestre. Sem essas datas, não é possível calcular as ocorrências.",
  weeks_unsupported:
    "O arquivo usa semanas alternadas, que esta importação ainda não converte em ocorrências.",
  never_scheduled: "O arquivo não marca a aula em nenhuma duração.",
  duplicate_occurrence: "O arquivo contém cards duplicados para uma mesma ocorrência.",
  no_dates: "Nenhuma data do semestre corresponde a esse dia da semana.",
};

type Props = {
  summary: ImportSummary;
  semesterId: string;
  onMapRooms: () => void;
  onReview?: () => void;
};

/** Explica por que não há importação aplicável e direciona às correções sem inventar dados. */
export function EmptyImportGuidance({ summary, semesterId, onMapRooms, onReview }: Props) {
  const reasons = Object.entries(summary.notApplicable)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);
  const needsSemester = (summary.notApplicable.term_without_dates ?? 0) > 0;
  const needsRoomMapping = (summary.notApplicable.room_unmapped ?? 0) > 0;

  return (
    <Callout tone="error" role="status" className="grid gap-3">
      <div className="grid gap-1">
        <h3 className="font-semibold">Nenhuma ocupação está pronta para aplicação</h3>
        <p>
          {summary.counts.nao_aplicavel} linhas estão não aplicáveis e não há linha pendente. O
          sistema bloqueia a gravação de um lote vazio e não inventa datas nem escolhe salas.
        </p>
      </div>
      {reasons.length > 0 && (
        <ul className="grid gap-2">
          {reasons.map(([code, count]) => (
            <li key={code} className="rounded-md border bg-background/50 p-2">
              <p className="font-medium">
                {count} · {describeReason(code, null).label}
              </p>
              <p className="text-sm">{NEXT_STEP[code] ?? "Revise essa linha antes de importar."}</p>
            </li>
          ))}
        </ul>
      )}
      <p className="text-sm">
        Depois de corrigir o semestre ou os vínculos, volte à conferência e execute-a novamente. As
        aulas ambíguas ou sem sala podem permanecer não aplicáveis; após a correção, as demais
        linhas com dados suficientes poderão ficar pendentes para aplicação.
      </p>
      <div className="flex flex-wrap gap-2">
        {needsSemester && (
          <Button asChild variant="outline">
            <a
              href={`/semestres/${encodeURIComponent(semesterId)}`}
              target="_blank"
              rel="noreferrer"
            >
              Ajustar datas do semestre
            </a>
          </Button>
        )}
        {needsRoomMapping && (
          <Button type="button" variant="outline" onClick={onMapRooms}>
            Revisar vínculos de salas
          </Button>
        )}
        {onReview !== undefined && (
          <Button type="button" variant="outline" onClick={onReview}>
            Voltar à conferência
          </Button>
        )}
      </div>
    </Callout>
  );
}
