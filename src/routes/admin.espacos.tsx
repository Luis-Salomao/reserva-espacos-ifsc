import { createFileRoute, useRouter } from "@tanstack/react-router";
import { AdminNav } from "#/components/admin/admin-nav";
import { SpacesLoadError, SpacesManager } from "#/components/admin/spaces-manager";
import { AppShell } from "#/components/app-shell";
import { Notice, PageHeader } from "#/components/page";
import { listAdminSpacesFn } from "#/server/admin";
import { guardAdmin } from "./-admin-guard";

export const Route = createFileRoute("/admin/espacos")({
  beforeLoad: ({ context }) => guardAdmin(context, "/admin/espacos"),
  loader: async () => {
    const result = await listAdminSpacesFn();
    if (!result.ok) throw new Error(result.message);
    return result.data;
  },
  component: SpacesPage,
  pendingComponent: SpacesPending,
  errorComponent: SpacesError,
});

function SpacesPage() {
  const spaces = Route.useLoaderData();
  return (
    <AppShell wide>
      <PageHeader title="Administração" description="Espaços reserváveis." />
      <AdminNav />
      <SpacesManager spaces={spaces} />
    </AppShell>
  );
}

function SpacesPending() {
  return (
    <AppShell wide>
      <PageHeader title="Administração" description="Espaços reserváveis." />
      <AdminNav />
      <Notice role="status">Carregando espaços…</Notice>
    </AppShell>
  );
}

function SpacesError() {
  const router = useRouter();
  return (
    <AppShell wide>
      <PageHeader title="Administração" description="Espaços reserváveis." />
      <AdminNav />
      <SpacesLoadError onRetry={() => void router.invalidate()} />
    </AppShell>
  );
}
