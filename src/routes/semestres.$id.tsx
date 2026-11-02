import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "#/components/app-shell";
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
      <p className="mb-2 text-sm">
        <Link to="/semestres" className="underline">
          Voltar aos semestres
        </Link>
      </p>
      <h1 className="mb-4 text-2xl font-semibold">Editar semestre</h1>
      <div className="rounded-lg border bg-surface p-4">
        {/* A chave refaz o estado do formulário ao trocar de semestre. */}
        <SemesterForm key={semester.id} semester={semester} />
      </div>
    </AppShell>
  );
}

function SemesterError() {
  return (
    <AppShell>
      <p role="alert" className="rounded-lg border bg-occ-conflict p-4">
        Não foi possível carregar o semestre. Ele pode ter sido removido ou você não tem permissão.
      </p>
      <p className="mt-3 text-sm">
        <Link to="/semestres" className="underline">
          Voltar aos semestres
        </Link>
      </p>
    </AppShell>
  );
}
