// Imprime (JSON) o código que o Vite serve ao navegador para um módulo. Roda no Node: o servidor do
// Vite não funciona dentro do `bun test` (setTimeout().unref ausente).
import { createServer } from "vite";

const [, , path] = process.argv;
const server = await createServer({
  configFile: "vite.config.ts",
  logLevel: "silent",
  server: { middlewareMode: true, hmr: false, watch: null },
  appType: "custom",
});
try {
  const result = await server.environments.client.transformRequest(path);
  process.stdout.write(JSON.stringify({ code: result?.code ?? "" }));
} finally {
  await server.close();
  process.exit(0); // o Vite deixa handles abertos
}
