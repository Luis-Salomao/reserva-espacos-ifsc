import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { createIsomorphicFn } from "@tanstack/react-start";
import { currentNonce } from "#/server/request-nonce";
import { getContext } from "./integrations/tanstack-query/root-provider";
import { routeTree } from "./routeTree.gen";

// Nonce da CSP da requisição em curso: só existe no servidor; o cliente não precisa dele.
const getSsrNonce = createIsomorphicFn()
  .server(() => currentNonce())
  .client(() => undefined);

export function getRouter() {
  const context = getContext();
  const nonce = getSsrNonce();

  const router = createTanStackRouter({
    routeTree,
    context,
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    ...(nonce === undefined ? {} : { ssr: { nonce } }),
  });

  setupRouterSsrQueryIntegration({ router, queryClient: context.queryClient });

  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
