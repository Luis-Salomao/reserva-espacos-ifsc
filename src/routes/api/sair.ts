import { createFileRoute } from "@tanstack/react-router";
import { getAuth, getCookieSecure } from "#/server/auth-context";
import { handleLogout } from "#/server/auth-handlers";

export const Route = createFileRoute("/api/sair")({
  server: {
    handlers: {
      POST: ({ request }) => handleLogout(request, getAuth(), getCookieSecure()),
    },
  },
});
