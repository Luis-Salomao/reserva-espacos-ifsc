// Declaração mínima; a Task 5 substitui pela saída de `wrangler types`.
declare module "cloudflare:workers" {
  export const env: { DB: import("@cloudflare/workers-types").D1Database };
}
