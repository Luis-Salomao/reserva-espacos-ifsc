import { createCsrfMiddleware, createMiddleware, createStart } from "@tanstack/react-start";
import { THEME_SCRIPT } from "#/lib/theme-script";
import { createNonce, runWithNonce } from "#/server/request-nonce";
import { applySecurityHeaders } from "#/server/security-headers";
import { csrfRejection } from "#/server/session";

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
    const rejection = csrfRejection(request);
    if (rejection !== null) return applySecurityHeaders(rejection, csp);
    const result = await runWithNonce(nonce, () => next());
    return { ...result, response: applySecurityHeaders(result.response, csp) };
  },
);

// Camada adicional do próprio Start (Sec-Fetch-Site/Origin), só para métodos que alteram estado.
const startCsrf = createCsrfMiddleware({
  filter: ({ request }) => MUTATING.has(request.method.toUpperCase()),
});

export const startInstance = createStart(() => ({
  requestMiddleware: [securityMiddleware, startCsrf],
}));
