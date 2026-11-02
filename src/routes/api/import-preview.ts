import { createFileRoute } from "@tanstack/react-router";
import { getAuth, getCookieSecure } from "#/server/auth-context";
import { handlePreviewRequest } from "#/server/import-preview";

export const Route = createFileRoute("/api/import-preview")({
  server: {
    handlers: {
      POST: ({ request }) => handlePreviewRequest(request, getAuth(), getCookieSecure()),
    },
  },
});
