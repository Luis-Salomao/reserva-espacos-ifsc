import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { decideRouteAccess, IMPORT_ROLES } from "#/server/session";

export const Route = createFileRoute("/importar")({
  // Só admin ou horários; sem sessão vai ao login e volta para cá depois.
  beforeLoad: ({ context }) => {
    const access = decideRouteAccess(context.session.user, IMPORT_ROLES, "/importar");
    if (access.kind === "login")
      throw redirect({ to: "/entrar", search: { voltar: access.voltar } });
    if (access.kind === "forbidden") throw redirect({ to: "/" });
  },
  component: Outlet,
});
