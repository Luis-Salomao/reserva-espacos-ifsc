import { Card } from "#/components/page";
import type { PreviewView } from "#/server/import-preview-view";

const SOURCE_LABEL = { xml: "Arquivo", grade: "Grade" } as const;

/** Avisos agrupados por tipo; cada grupo é recolhível e mostra contagem e exemplos. */
export function WarningList({ warnings }: { warnings: PreviewView["warnings"] }) {
  if (warnings.length === 0) {
    return <p className="text-muted-foreground">Nenhum aviso.</p>;
  }
  return (
    <ul className="grid gap-2">
      {warnings.map((warning) => (
        <li key={`${warning.source}:${warning.section}:${warning.code}`}>
          <Card compact className="shadow-none">
            <details>
              <summary className="cursor-pointer break-words font-medium">
                {warning.message}{" "}
                <span className="whitespace-nowrap font-normal text-muted-foreground">
                  ({SOURCE_LABEL[warning.source]} · {warning.section}: {warning.count}{" "}
                  {warning.count === 1 ? "ocorrência" : "ocorrências"})
                </span>
              </summary>
              {warning.examples.length > 0 && (
                <p className="mt-2 break-words text-sm text-muted-foreground">
                  Exemplos: {warning.examples.join(", ")}
                </p>
              )}
            </details>
          </Card>
        </li>
      ))}
    </ul>
  );
}
