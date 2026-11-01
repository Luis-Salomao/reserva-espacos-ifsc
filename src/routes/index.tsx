import { createFileRoute } from "@tanstack/react-router";
import { listSpaces } from "#/server/spaces";

export const Route = createFileRoute("/")({
  loader: () => listSpaces(),
  component: Home,
});

function Home() {
  const spaces = Route.useLoaderData();
  return (
    <div className="p-8">
      <h1 className="text-4xl font-bold">Reserva de espaços</h1>
      <p className="mt-4 text-lg">
        {spaces.length === 0
          ? "Nenhum espaço cadastrado."
          : `${spaces.length} espaço(s) cadastrado(s).`}
      </p>
    </div>
  );
}
