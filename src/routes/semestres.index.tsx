import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "#/components/app-shell";
import { Notice, PageHeader } from "#/components/page";
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
      <PageHeader
        title="Semestres"
        description="Vigência, datas de cada duração e blocos de horário, configurados uma vez e reutilizados nas importações."
      />
      <SemestersManager semesters={semesters} />
    </AppShell>
  );
}

function SemestersError() {
  return (
    <AppShell>
      <Notice tone="error" role="alert">
        Não foi possível carregar os semestres. Tente novamente em instantes.
      </Notice>
    </AppShell>
  );
}
