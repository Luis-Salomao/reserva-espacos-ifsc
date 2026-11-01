import { createFileRoute } from "@tanstack/react-router";
import { handlePreviewRequest } from "#/server/import-preview";

export const Route = createFileRoute("/api/import-preview")({
  server: {
    handlers: {
      POST: ({ request }) => handlePreviewRequest(request),
    },
  },
});
