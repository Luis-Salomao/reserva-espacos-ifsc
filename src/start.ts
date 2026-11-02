import {
  createCsrfMiddleware,
  createMiddleware,
  createServerOnlyFn,
  createStart,
} from "@tanstack/react-start";
import { getEnv } from "#/infra/env";
import { THEME_SCRIPT } from "#/lib/theme-script";
import { createNonce, runWithNonce } from "#/server/request-nonce";
import { applySecurityHeaders } from "#/server/security-headers";
import { allowedOrigin, csrfRejection } from "#/server/session";
import { getRuntimeEnv } from "#db-client";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Valida o Origin de toda requisição que altera estado (rotas de servidor e server functions) e
 * acrescenta os cabeçalhos de segurança a todas as respostas. A CSP leva um nonce por requisição,
 * disponível ao roteador (`src/router.tsx`) durante a renderização. A lógica fica em
 * `#/server`, testada; aqui só a ligação com o Start.
 */
const securityMiddleware = createMiddleware({ type: "request" }).server(
  async ({ request, next }) => {
    const nonce = createNonce();
    const csp = { dev: import.meta.env.DEV, themeScript: THEME_SCRIPT, nonce };
    const publicOrigin = MUTATING.has(request.method.toUpperCase())
      ? getEnv(getRuntimeEnv()).PUBLIC_ORIGIN
      : undefined;
    const rejection = csrfRejection(request, publicOrigin);
    if (rejection !== null) return applySecurityHeaders(rejection, csp);
    const result = await runWithNonce(nonce, () => next());
    return { ...result, response: applySecurityHeaders(result.response, csp) };
  },
);

// Camada adicional do próprio Start (Sec-Fetch-Site/Origin), só para métodos que alteram estado.
// O `origin` é o mesmo do nosso middleware (PUBLIC_ORIGIN ou a origem da requisição); sem isso, atrás
// de proxy com TLS o Start compararia o Origin público com a URL interna e recusaria tudo.
// Todo acesso ao ambiente/banco (`#db-client`, `bun:sqlite`) fica dentro de `createServerOnlyFn` ou de
// `.server()`: este módulo também entra no bundle do navegador e não pode puxá-los no escopo do módulo
// (src/start.test.ts guarda isso).
const originMatches = createServerOnlyFn(
  (value: string, request: Request): boolean =>
    value === allowedOrigin(request.url, getEnv(getRuntimeEnv()).PUBLIC_ORIGIN),
);

const startCsrf = createCsrfMiddleware({
  filter: ({ request }) => MUTATING.has(request.method.toUpperCase()),
  origin: (value, { request }) => originMatches(value, request),
});

export const startInstance = createStart(() => ({
  requestMiddleware: [securityMiddleware, startCsrf],
}));
