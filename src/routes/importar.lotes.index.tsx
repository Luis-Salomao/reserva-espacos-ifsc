import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "#/components/app-shell";
import { BatchList } from "#/components/import/batch-list";
import { listImportBatchesFn } from "#/server/import-fns";

export const Route = createFileRoute("/importar/lotes/")({
  loader: async () => {
    const result = await listImportBatchesFn();
    if (!result.ok) throw new Error(result.message);
    return result.data;
  },
  component: BatchesPage,
  errorComponent: BatchesError,
});

function BatchesPage() {
  const batches = Route.useLoaderData();
  const { session } = Route.useRouteContext();
  return (
    <AppShell wide>
      <h1 className="text-2xl font-semibold">Lotes de importação</h1>
      <p className="mt-1 mb-4 text-muted-foreground">
        Cada arquivo importado vira um lote por semestre. Abra um lote para ver o resultado de cada
        aula.
      </p>
      <BatchList batches={batches} timeZone={session.timeZone} />
    </AppShell>
  );
}

function BatchesError() {
  return (
    <AppShell wide>
      <p role="alert" className="rounded-lg border bg-occ-conflict p-4">
        Não foi possível carregar os lotes. Tente novamente em instantes.
      </p>
    </AppShell>
  );
}
