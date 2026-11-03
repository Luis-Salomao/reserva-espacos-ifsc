import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "#/components/app-shell";
import { Card, Notice, PageHeader } from "#/components/page";
import { SemesterForm } from "#/components/semesters/semester-form";
import { getSemesterFn } from "#/server/admin";
import { guardSemesters } from "./-admin-guard";

export const Route = createFileRoute("/semestres/$id")({
  beforeLoad: ({ context, params }) => guardSemesters(context, `/semestres/${params.id}`),
  loader: async ({ params }) => {
    const result = await getSemesterFn({ data: { id: params.id } });
    if (!result.ok) throw new Error(result.message);
    return result.data;
  },
  component: SemesterPage,
  errorComponent: SemesterError,
});

function SemesterPage() {
  const semester = Route.useLoaderData();
  return (
    <AppShell>
      <PageHeader
        title="Editar semestre"
        back={
          <Link
            to="/semestres"
            className="font-medium text-accent-text underline underline-offset-4"
          >
            Voltar aos semestres
          </Link>
        }
      />
      <Card>
        {/* A chave refaz o estado do formulário ao trocar de semestre. */}
        <SemesterForm key={semester.id} semester={semester} />
      </Card>
    </AppShell>
  );
}

function SemesterError() {
  return (
    <AppShell>
      <Notice tone="error" role="alert">
        Não foi possível carregar o semestre. Ele pode ter sido removido ou você não tem permissão.
      </Notice>
      <p className="mt-3 text-sm">
        <Link to="/semestres" className="underline">
          Voltar aos semestres
        </Link>
      </p>
    </AppShell>
  );
}
