import { createFileRoute } from "@tanstack/react-router";
import { getAuth, getCookieSecure } from "#/server/auth-context";
import { handleLogin } from "#/server/auth-handlers";

export const Route = createFileRoute("/api/entrar")({
  server: {
    handlers: {
      POST: ({ request }) => handleLogin(request, getAuth(), getCookieSecure()),
    },
  },
});
