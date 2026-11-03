import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AppShell } from "#/components/app-shell";
import { BatchDetail } from "#/components/import/batch-detail";
import { loadImportRows } from "#/components/import/load-rows";
import { Notice } from "#/components/page";

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
      <Notice tone="error" role="alert">
        Lote não encontrado ou não foi possível carregá-lo.
      </Notice>
      <Link
        to="/importar/lotes"
        className="mt-3 inline-block text-sm font-medium text-accent-text underline underline-offset-4"
      >
        Voltar à lista de lotes
      </Link>
    </AppShell>
  );
}
