import { createHash } from "node:crypto";

/** Fonte de script CSP para um script inline: `'sha256-<base64 do texto exato>'`. */
export function hashInlineScript(script: string): string {
  return `'sha256-${createHash("sha256").update(script).digest("base64")}'`;
}

export type CspOptions = { dev: boolean; themeScript: string; nonce: string };

/**
 * Content-Security-Policy. Em produção só scripts do próprio site, o script inline de tema (por
 * hash) e os scripts inline que o TanStack Start gera para hidratar a página (por nonce de
 * requisição). Em desenvolvimento o Vite injeta scripts inline (React Refresh) e usa WebSocket
 * local para HMR; por isso o dev usa `'unsafe-inline'` (que um nonce ou hash desativaria) e as
 * conexões locais. Nada disso vale em produção.
 */
export function buildCsp({ dev, themeScript, nonce }: CspOptions): string {
  const scriptSrc = dev
    ? ["'self'", "'unsafe-inline'"]
    : ["'self'", `'nonce-${nonce}'`, hashInlineScript(themeScript)];
  const connectSrc = dev
    ? ["'self'", "ws://localhost:*", "ws://127.0.0.1:*", "http://localhost:*"]
    : ["'self'"];
  return [
    "default-src 'self'",
    `script-src ${scriptSrc.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    `connect-src ${connectSrc.join(" ")}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

/**
 * Acrescenta cabeçalhos de segurança. A CSP só vai em respostas HTML; nosniff e Referrer-Policy
 * vão em todas. Devolve uma nova resposta (os cabeçalhos da original podem ser imutáveis).
 */
export function applySecurityHeaders(response: Response, options: CspOptions): Response {
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "same-origin");
  if ((headers.get("content-type") ?? "").toLowerCase().startsWith("text/html")) {
    headers.set("Content-Security-Policy", buildCsp(options));
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
