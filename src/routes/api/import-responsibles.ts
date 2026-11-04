import { createFileRoute } from "@tanstack/react-router";
import { getImportFlowDeps } from "#/server/import-deps";
import { handleResponsiblesRequest } from "#/server/import-prepare";

export const Route = createFileRoute("/api/import-responsibles")({
  server: {
    handlers: {
      POST: ({ request }) => handleResponsiblesRequest(request, getImportFlowDeps()),
    },
  },
});
