import { createFileRoute } from "@tanstack/react-router";
import { getAuth } from "#/server/auth-context";
import { requireRole } from "#/server/auth-handlers";
import { handlePreviewRequest } from "#/server/import-preview";
import { IMPORT_ROLES } from "#/server/session";

export const Route = createFileRoute("/api/import-preview")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const access = await requireRole(request, getAuth(), IMPORT_ROLES);
        if (!access.ok) return access.response;
        return handlePreviewRequest(request);
      },
    },
  },
});
