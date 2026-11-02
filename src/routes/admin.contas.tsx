import { createFileRoute } from "@tanstack/react-router";
import { AccountsManager } from "#/components/admin/accounts-manager";
import { AdminNav } from "#/components/admin/admin-nav";
import { AppShell } from "#/components/app-shell";
import { listAccountsFn } from "#/server/admin";
import { guardAdmin } from "./-admin-guard";

export const Route = createFileRoute("/admin/contas")({
  beforeLoad: ({ context }) => guardAdmin(context, "/admin/contas"),
  loader: async () => {
    const result = await listAccountsFn();
    if (!result.ok) throw new Error(result.message);
    return result.data;
  },
  component: AccountsPage,
  errorComponent: AdminError,
});

function AccountsPage() {
  const users = Route.useLoaderData();
  const { session } = Route.useRouteContext();
  return (
    <AppShell>
      <h1 className="mb-1 text-2xl font-semibold">Administração</h1>
      <p className="mb-4 text-muted-foreground">Contas de acesso e papéis.</p>
      <AdminNav />
      <AccountsManager users={users} currentUserId={session.user?.id ?? ""} />
    </AppShell>
  );
}

function AdminError() {
  return (
    <AppShell>
      <p role="alert" className="rounded-lg border bg-occ-conflict p-4">
        Não foi possível carregar as contas. Tente novamente em instantes.
      </p>
    </AppShell>
  );
}
