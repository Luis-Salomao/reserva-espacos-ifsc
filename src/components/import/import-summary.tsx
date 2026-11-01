import type { PreviewView } from "#/server/import-preview-view";

const LABELS: Array<[keyof PreviewView["counts"], string]> = [
  ["periods", "Períodos"],
  ["classrooms", "Salas"],
  ["teachers", "Docentes"],
  ["subjects", "Disciplinas"],
  ["classes", "Turmas"],
  ["lessons", "Aulas"],
  ["cards", "Cards"],
  ["slots", "Horários semanais"],
];

/** Cartões de contagem do arquivo importado. */
export function ImportSummary({ view }: { view: PreviewView }) {
  const { slotsByStatus } = view;
  return (
    <div className="grid gap-3">
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {LABELS.map(([key, label]) => (
          <div key={key} className="rounded-lg border bg-surface px-3 py-2">
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="text-xl font-semibold">{view.counts[key]}</dd>
          </div>
        ))}
      </dl>
      <p className="text-sm text-muted-foreground">
        Horários: {slotsByStatus.applicable} com uma sala, {slotsByStatus.no_room} sem sala e{" "}
        {slotsByStatus.multiple_rooms} com várias salas.
      </p>
    </div>
  );
}
