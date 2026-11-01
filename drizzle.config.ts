import { defineConfig } from "drizzle-kit";

// Config local (bun:sqlite). O arquivo vem de DATABASE_PATH (veja .env.example); sem padrão:
// se faltar, o drizzle-kit rejeita a url vazia.
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/infra/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_PATH ?? "" },
});
