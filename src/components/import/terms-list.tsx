import type { PreviewView } from "#/server/import-preview-view";

/** Durações (termsdefs) usadas pelos horários, ainda sem datas de calendário. */
export function TermsList({ terms }: { terms: PreviewView["termsUsed"] }) {
  return (
    <div className="grid gap-2">
      <p className="text-sm text-muted-foreground">
        ainda sem datas: serão definidas na configuração do semestre
      </p>
      {terms.length === 0 ? (
        <p className="text-muted-foreground">Nenhuma duração encontrada.</p>
      ) : (
        <ul className="grid gap-2">
          {terms.map((term) => (
            <li
              key={term.mask}
              className="flex flex-wrap justify-between gap-x-4 rounded-lg border bg-surface px-3 py-2"
            >
              <span className="break-words font-medium">{term.label}</span>
              <span className="text-sm text-muted-foreground">
                máscara <code className="break-all">{term.mask === "" ? "—" : term.mask}</code> ·{" "}
                {term.slots} {term.slots === 1 ? "horário" : "horários"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
