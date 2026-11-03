import { Link } from "@tanstack/react-router";
import { Card, Notice } from "#/components/page";
import { buttonVariants } from "#/components/ui/button";
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
        <h2 id="semesters-title" className="text-lg font-semibold tracking-tight">
          Semestres ({semesters.length})
        </h2>
        {semesters.length === 0 ? (
          <Notice className="p-6 text-muted-foreground">Nenhum semestre cadastrado</Notice>
        ) : (
          <ul className="grid gap-3">
            {semesters.map((semester) => (
              <li key={semester.id}>
                <Card className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="break-words font-medium">{semester.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatDate(semester.start)} a {formatDate(semester.end)} ·{" "}
                      {semester.terms.length === 1
                        ? "1 duração"
                        : `${semester.terms.length} durações`}{" "}
                      ·{" "}
                      {semester.blocks.length === 1
                        ? "1 bloco"
                        : `${semester.blocks.length} blocos`}
                    </p>
                  </div>
                  <Link
                    to="/semestres/$id"
                    params={{ id: semester.id }}
                    aria-label={`Editar ${semester.name}`}
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                  >
                    Editar
                  </Link>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="new-semester-title">
        <Card>
          <h2 id="new-semester-title" className="mb-3 text-lg font-semibold tracking-tight">
            Novo semestre
          </h2>
          <SemesterForm semester={null} />
        </Card>
      </section>
    </div>
  );
}
