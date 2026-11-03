import { createFileRoute, redirect } from "@tanstack/react-router";
import { AppShell } from "#/components/app-shell";
import { Notice, PageHeader } from "#/components/page";
import { canViewHome } from "#/server/session";
import { listSpaces } from "#/server/spaces";

export const Route = createFileRoute("/")({
  // Com PUBLIC_READ=false a página inicial exige login.
  beforeLoad: ({ context }) => {
    const { user, publicRead } = context.session;
    if (!canViewHome(publicRead, user)) throw redirect({ to: "/entrar" });
  },
  loader: () => listSpaces(),
  component: Home,
  errorComponent: HomeError,
});

function Home() {
  const spaces = Route.useLoaderData();
  return (
    <AppShell>
      <PageHeader title="Espaços" description="Espaços do campus disponíveis para reserva." />
      {spaces.length === 0 ? (
        <Notice className="p-6 text-muted-foreground">Nenhum espaço cadastrado</Notice>
      ) : (
        <ul className="grid gap-2">
          {spaces.map((space) => (
            <li
              key={space.id}
              className="flex items-center justify-between gap-4 rounded-xl border bg-surface px-4 py-3.5 shadow-xs"
            >
              <span className="min-w-0 break-words font-medium">{space.name}</span>
              {space.capacity !== null && (
                <span className="shrink-0 text-sm text-muted-foreground">
                  {space.capacity} lugares
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}

function HomeError() {
  return (
    <AppShell>
      <Notice role="alert" className="p-6">
        Não foi possível carregar os espaços. Tente novamente em instantes.
      </Notice>
    </AppShell>
  );
}
