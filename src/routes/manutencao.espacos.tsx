import { createFileRoute, useRouter } from "@tanstack/react-router";
import { AppShell } from "#/components/app-shell";
import { MaintenanceSpacesManager } from "#/components/maintenance/spaces-manager";
import { Callout, Notice, PageHeader } from "#/components/page";
import { Button } from "#/components/ui/button";
import { listSpaceInfoFn } from "#/server/admin";
import { decideRouteAccess, SPACE_INFO_ROLES } from "#/server/session";
import { guardSpaceInfo } from "./-admin-guard";

export const Route = createFileRoute("/manutencao/espacos")({
  beforeLoad: ({ context }) => guardSpaceInfo(context, "/manutencao/espacos"),
  loader: async ({ context }) => {
    const access = decideRouteAccess(context.session.user, SPACE_INFO_ROLES, "/manutencao/espacos");
    if (access.kind !== "allow") return { spaces: null };
    const result = await listSpaceInfoFn();
    if (!result.ok) throw new Error(result.message);
    return { spaces: result.data };
  },
  component: MaintenanceSpacesPage,
  pendingComponent: MaintenanceSpacesPending,
  errorComponent: MaintenanceSpacesError,
});

const HEADER = {
  title: "Manutenção dos espaços",
  description: "Atualize capacidade, equipamentos e computadores em manutenção de cada espaço.",
};

function MaintenanceSpacesPage() {
  const { spaces } = Route.useLoaderData();
  return (
    <AppShell>
      <PageHeader {...HEADER} />
      {spaces === null ? (
        <Callout tone="error" role="alert">
          Sem permissão para esta página.
        </Callout>
      ) : (
        <MaintenanceSpacesManager spaces={spaces} />
      )}
    </AppShell>
  );
}

function MaintenanceSpacesPending() {
  return (
    <AppShell>
      <PageHeader {...HEADER} />
      <Notice role="status">Carregando espaços…</Notice>
    </AppShell>
  );
}

function MaintenanceSpacesError() {
  const router = useRouter();
  return (
    <AppShell>
      <PageHeader {...HEADER} />
      <Callout tone="error" role="alert" className="grid justify-items-start gap-2">
        <p className="font-medium">Não foi possível carregar os espaços.</p>
        <Button type="button" size="sm" variant="outline" onClick={() => void router.invalidate()}>
          Tentar de novo
        </Button>
      </Callout>
    </AppShell>
  );
}
