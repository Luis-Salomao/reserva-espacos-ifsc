import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AppShell } from "#/components/app-shell";
import { BatchDetail } from "#/components/import/batch-detail";
import { loadImportRows } from "#/components/import/load-rows";

export const Route = createFileRoute("/importar/lotes/$id")({
  loader: async ({ params }) => {
    const result = await loadImportRows({ batchId: params.id, limit: 1, offset: 0 });
    if (!result.ok) throw new Error(result.message);
    return result.data.batch;
  },
  component: BatchPage,
  errorComponent: BatchError,
});

function BatchPage() {
  const batch = Route.useLoaderData();
  const { session } = Route.useRouteContext();
  const navigate = useNavigate();
  return (
    <AppShell wide>
      <BatchDetail
        batch={batch}
        load={loadImportRows}
        timeZone={session.timeZone}
        onDiscarded={() => void navigate({ to: "/importar/lotes" })}
      />
    </AppShell>
  );
}

function BatchError() {
  return (
    <AppShell wide>
      <p role="alert" className="rounded-lg border bg-occ-conflict p-4">
        Lote não encontrado ou não foi possível carregá-lo.
      </p>
      <Link
        to="/importar/lotes"
        className="mt-3 inline-block text-sm font-medium text-accent-text underline"
      >
        Voltar à lista de lotes
      </Link>
    </AppShell>
  );
}
