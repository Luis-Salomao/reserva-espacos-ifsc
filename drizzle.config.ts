import { defineConfig } from "drizzle-kit";
import { settings } from "./src/infra/settings";

// Config local (bun:sqlite). O arquivo vem de DATABASE_PATH ou, sem ela, do padrão de desenvolvimento em settings.ts.
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/infra/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_PATH || settings.DATABASE_PATH },
});
