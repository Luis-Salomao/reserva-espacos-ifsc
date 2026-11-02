import { createFileRoute } from "@tanstack/react-router";
import { AdminNav } from "#/components/admin/admin-nav";
import { SpacesManager } from "#/components/admin/spaces-manager";
import { AppShell } from "#/components/app-shell";
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
      <h1 className="mb-1 text-2xl font-semibold">Administração</h1>
      <p className="mb-4 text-muted-foreground">Espaços reserváveis.</p>
      <AdminNav />
      <SpacesManager spaces={spaces} />
    </AppShell>
  );
}

function AdminError() {
  return (
    <AppShell>
      <p role="alert" className="rounded-lg border bg-occ-conflict p-4">
        Não foi possível carregar os espaços. Tente novamente em instantes.
      </p>
    </AppShell>
  );
}
