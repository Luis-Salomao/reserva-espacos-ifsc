import type { PreviewView } from "#/server/import-preview-view";
import { weekdayName } from "./weekdays";

type Props = {
  overlaps: PreviewView["overlaps"];
  detail: PreviewView["overlapsDetail"];
  truncated?: boolean;
};

function Side({ side }: { side: PreviewView["overlapsDetail"][number]["a"] }) {
  const turmas = side.classes === "" ? "" : ` · ${side.classes}`;
  return (
    <>
      {side.label}
      {turmas} ({side.start}–{side.end})
    </>
  );
}

const KIND_LABEL = { certain: "Certa", possible: "Possível" } as const;

/** Sobreposições internas: certas (uma sala cada) e possíveis (aula com várias salas). */
export function OverlapList({ overlaps, detail, truncated = false }: Props) {
  return (
    <div className="grid gap-3">
      <p>
        Certas: <strong>{overlaps.certain}</strong> · Possíveis:{" "}
        <strong>{overlaps.possible}</strong>
      </p>
      <p className="text-sm text-muted-foreground">
        Uma sobreposição é "possível" quando uma das aulas tem várias salas: o arquivo não diz se
        ela usa todas ao mesmo tempo, então o conflito não é certo.
      </p>
      {truncated && (
        <p className="text-sm text-muted-foreground">
          Mostrando {detail.length} de {overlaps.certain + overlaps.possible} sobreposições.
        </p>
      )}
      {detail.length > 0 && (
        <ul className="grid gap-2">
          {detail.map((overlap) => (
            <li
              key={overlap.key}
              className="break-words rounded-lg border bg-surface px-3 py-2 text-sm"
            >
              <span className="font-medium">
                {KIND_LABEL[overlap.kind]} · sala {overlap.room} · {weekdayName(overlap.weekday)}
              </span>
              <br />
              <Side side={overlap.a} /> e <Side side={overlap.b} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
