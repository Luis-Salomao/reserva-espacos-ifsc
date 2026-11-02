import { describe, expect, test } from "bun:test";

describe("src/start.ts no navegador", () => {
  test("o módulo servido ao cliente não importa o banco nem o ambiente do servidor", async () => {
    // Este módulo entra no bundle do cliente; um `import "#db-client"` (bun:sqlite) no escopo do
    // módulo impede a hidratação em `bun run dev`. Tudo que é do servidor fica em .server() ou
    // createServerOnlyFn, que o compilador do Start remove do cliente.
    const proc = Bun.spawn(["node", "scripts/client-module-imports.mjs", "/src/start.ts"], {
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, DEPLOY_TARGET: "local" },
    });
    const [out, err, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    expect(err).toBe("");
    expect(code).toBe(0);
    const { code: served } = JSON.parse(out) as { code: string };
    expect(served.length).toBeGreaterThan(0);
    // Só os módulos importados contam (comentários podem citar o banco).
    const imported = [...served.matchAll(/(?:from|import\()\s*["']([^"']+)["']/g)].map(
      (match) => match[1] ?? "",
    );
    expect(imported.length).toBeGreaterThan(0);
    for (const specifier of imported) {
      expect(specifier).not.toMatch(/db-client|bun:sqlite|client\.local|infra\/|server\//);
    }
  }, 60_000);
});
