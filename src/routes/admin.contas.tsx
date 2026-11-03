import { createFileRoute } from "@tanstack/react-router";
import { AccountsManager } from "#/components/admin/accounts-manager";
import { AdminNav } from "#/components/admin/admin-nav";
import { AppShell } from "#/components/app-shell";
import { Notice, PageHeader } from "#/components/page";
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
      <PageHeader title="Administração" description="Contas de acesso e papéis." />
      <AdminNav />
      <AccountsManager users={users} currentUserId={session.user?.id ?? ""} />
    </AppShell>
  );
}

function AdminError() {
  return (
    <AppShell>
      <Notice tone="error" role="alert">
        Não foi possível carregar as contas. Tente novamente em instantes.
      </Notice>
    </AppShell>
  );
}
