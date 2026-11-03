import { resolve } from "node:path";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

// Alvo de deploy: "local" (Bun + SQLite, via Nitro) ou "cloudflare" (Workers + D1).
// Os dois plugins de servidor nunca ficam ativos juntos.
const target = process.env.DEPLOY_TARGET === "cloudflare" ? "cloudflare" : "local";

const serverPlugin =
  target === "cloudflare"
    ? cloudflare({ viteEnvironment: { name: "ssr" } })
    : nitro({ preset: "bun", compressPublicAssets: { gzip: true, brotli: true } });

const config = defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: {
      "#db-client": resolve(import.meta.dirname, `src/infra/db/client.${target}.ts`),
    },
  },
  plugins: [devtools(), serverPlugin, tailwindcss(), tanstackStart(), viteReact()],
});

export default config;
