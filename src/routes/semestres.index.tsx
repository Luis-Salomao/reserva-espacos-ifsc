import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "#/components/app-shell";
import { SemestersManager } from "#/components/semesters/semesters-manager";
import { listSemestersFn } from "#/server/admin";
import { guardSemesters } from "./-admin-guard";

export const Route = createFileRoute("/semestres/")({
  beforeLoad: ({ context }) => guardSemesters(context, "/semestres"),
  loader: async () => {
    const result = await listSemestersFn();
    if (!result.ok) throw new Error(result.message);
    return result.data;
  },
  component: SemestersPage,
  errorComponent: SemestersError,
});

function SemestersPage() {
  const semesters = Route.useLoaderData();
  return (
    <AppShell>
      <h1 className="mb-1 text-2xl font-semibold">Semestres</h1>
      <p className="mb-4 text-muted-foreground">
        Vigência, datas de cada duração e blocos de horário, configurados uma vez e reutilizados nas
        importações.
      </p>
      <SemestersManager semesters={semesters} />
    </AppShell>
  );
}

function SemestersError() {
  return (
    <AppShell>
      <p role="alert" className="rounded-lg border bg-occ-conflict p-4">
        Não foi possível carregar os semestres. Tente novamente em instantes.
      </p>
    </AppShell>
  );
}
