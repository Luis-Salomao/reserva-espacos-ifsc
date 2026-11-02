import { createFileRoute } from "@tanstack/react-router";
import { getImportFlowDeps } from "#/server/import-deps";
import { handlePrepareRequest } from "#/server/import-prepare";

export const Route = createFileRoute("/api/import-prepare")({
  server: {
    handlers: {
      POST: ({ request }) => handlePrepareRequest(request, getImportFlowDeps()),
    },
  },
});
