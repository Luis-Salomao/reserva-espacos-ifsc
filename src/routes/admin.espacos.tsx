import { createFileRoute } from "@tanstack/react-router";
import { AdminNav } from "#/components/admin/admin-nav";
import { SpacesManager } from "#/components/admin/spaces-manager";
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
  errorComponent: AdminError,
});

function SpacesPage() {
  const spaces = Route.useLoaderData();
  return (
    <AppShell>
      <PageHeader title="Administração" description="Espaços reserváveis." />
      <AdminNav />
      <SpacesManager spaces={spaces} />
    </AppShell>
  );
}

function AdminError() {
  return (
    <AppShell>
      <Notice tone="error" role="alert">
        Não foi possível carregar os espaços. Tente novamente em instantes.
      </Notice>
    </AppShell>
  );
}
