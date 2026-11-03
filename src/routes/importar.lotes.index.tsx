import { createFileRoute, useRouter } from "@tanstack/react-router";
import { AppShell } from "#/components/app-shell";
import { BatchList } from "#/components/import/batch-list";
import { Notice, PageHeader } from "#/components/page";
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
  const router = useRouter();
  return (
    <AppShell wide>
      <PageHeader
        title="Lotes de importação"
        description="Cada arquivo importado vira um lote por semestre. Abra um lote para ver o resultado de cada aula."
      />
      <BatchList
        batches={batches}
        timeZone={session.timeZone}
        onChanged={() => void router.invalidate()}
      />
    </AppShell>
  );
}

function BatchesError() {
  return (
    <AppShell wide>
      <Notice tone="error" role="alert">
        Não foi possível carregar os lotes. Tente novamente em instantes.
      </Notice>
    </AppShell>
  );
}
