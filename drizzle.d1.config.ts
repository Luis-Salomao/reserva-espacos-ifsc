import { defineConfig } from "drizzle-kit";

// Config para inspecionar o D1 remoto (db:studio:d1). Credenciais só por env.
export default defineConfig({
  dialect: "sqlite",
  driver: "d1-http",
  schema: "./src/infra/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID ?? "",
    databaseId: process.env.CLOUDFLARE_DATABASE_ID ?? "",
    token: process.env.CLOUDFLARE_D1_TOKEN ?? "",
  },
});
