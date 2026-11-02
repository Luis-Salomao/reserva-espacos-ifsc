import { createFileRoute, Outlet } from "@tanstack/react-router";
import { guardImport } from "./-admin-guard";

export const Route = createFileRoute("/importar")({
  // Só admin ou horários; sem sessão vai ao login e volta ao caminho pedido (inclui as rotas filhas).
  beforeLoad: ({ context, location }) => guardImport(context, location),
  component: Outlet,
});
