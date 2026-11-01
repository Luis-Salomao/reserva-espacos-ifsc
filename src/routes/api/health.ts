import { createFileRoute } from "@tanstack/react-router";
import { getHealth } from "#/server/health";

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () => {
        const health = await getHealth();
        return Response.json(health, { status: health.ok ? 200 : 503 });
      },
    },
  },
});
