import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "#/components/app-shell";
import { listSpaces } from "#/server/spaces";

export const Route = createFileRoute("/")({
  loader: () => listSpaces(),
  component: Home,
  errorComponent: HomeError,
});

function Home() {
  const spaces = Route.useLoaderData();
  return (
    <AppShell>
      <h1 className="text-2xl font-semibold">Espaços</h1>
      {spaces.length === 0 ? (
        <p className="mt-4 rounded-lg border bg-surface p-6 text-center text-muted-foreground">
          Nenhum espaço cadastrado
        </p>
      ) : (
        <ul className="mt-4 grid gap-2">
          {spaces.map((space) => (
            <li
              key={space.id}
              className="flex items-center justify-between gap-4 rounded-lg border bg-surface px-4 py-3"
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
      <p role="alert" className="rounded-lg border bg-surface p-6 text-center">
        Não foi possível carregar os espaços. Tente novamente em instantes.
      </p>
    </AppShell>
  );
}
