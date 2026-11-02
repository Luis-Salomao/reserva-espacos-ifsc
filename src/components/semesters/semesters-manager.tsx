import { Link } from "@tanstack/react-router";
import type { Semester } from "#/domain/semester";
import { SemesterForm } from "./semester-form";

function formatDate(value: string): string {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

/** Lista de semestres e formulário de criação. */
export function SemestersManager({ semesters }: { semesters: Semester[] }) {
  return (
    <div className="grid gap-6">
      <section aria-labelledby="semesters-title" className="grid gap-3">
        <h2 id="semesters-title" className="text-xl font-semibold">
          Semestres ({semesters.length})
        </h2>
        {semesters.length === 0 ? (
          <p className="rounded-lg border bg-surface p-6 text-center text-muted-foreground">
            Nenhum semestre cadastrado
          </p>
        ) : (
          <ul className="grid gap-3">
            {semesters.map((semester) => (
              <li
                key={semester.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-surface p-4"
              >
                <div className="min-w-0">
                  <p className="break-words font-medium">{semester.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatDate(semester.start)} a {formatDate(semester.end)} ·{" "}
                    {semester.terms.length === 1
                      ? "1 duração"
                      : `${semester.terms.length} durações`}{" "}
                    ·{" "}
                    {semester.blocks.length === 1 ? "1 bloco" : `${semester.blocks.length} blocos`}
                  </p>
                </div>
                <Link
                  to="/semestres/$id"
                  params={{ id: semester.id }}
                  aria-label={`Editar ${semester.name}`}
                  className="rounded-md border px-3 py-2 text-sm hover:bg-surface-2"
                >
                  Editar
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="new-semester-title" className="rounded-lg border bg-surface p-4">
        <h2 id="new-semester-title" className="mb-3 text-xl font-semibold">
          Novo semestre
        </h2>
        <SemesterForm semester={null} />
      </section>
    </div>
  );
}
