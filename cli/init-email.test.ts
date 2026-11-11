import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const directory = mkdtempSync(join(tmpdir(), "reserva-init-email-"));
afterAll(() => rmSync(directory, { recursive: true, force: true }));

async function run(args: string[]) {
  const module = JSON.stringify(join(import.meta.dir, "init.ts"));
  const process = Bun.spawn(
    [
      globalThis.process.execPath,
      "--eval",
      `import { runInit } from ${module}; process.exit(await runInit(${JSON.stringify(args)}));`,
    ],
    {
      cwd: directory,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...globalThis.process.env,
        RESEND_API_KEY: "secret-fixture-not-for-output",
        EMAIL_PAYLOAD_KEY: "payload-fixture-not-for-output",
      },
    },
  );
  const [stdout, stderr, code] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]);
  return { output: stdout + stderr, code };
}

test("dry-run Resend imprime só configuração pública e não grava segredos do ambiente", async () => {
  const result = await run([
    "--target",
    "local",
    "--yes",
    "--dry-run",
    "--email-provider",
    "resend",
    "--email-from",
    "reservas@example.org",
    "--public-origin",
    "https://reservas.example.org",
  ]);
  expect(result.code).toBe(0);
  expect(result.output).toContain("EMAIL_PROVIDER=resend");
  expect(result.output).not.toContain("secret-fixture-not-for-output");
  expect(result.output).not.toContain("payload-fixture-not-for-output");
  expect(await Bun.file(join(directory, ".env")).exists()).toBe(false);
});

test("instalação recusa sobrescrever configuração existente sem force", async () => {
  const path = join(directory, ".env");
  writeFileSync(path, "KEEP_EXISTING=true\n");
  const result = await run(["--target", "local", "--yes"]);
  expect(result.code).toBe(1);
  expect(result.output).toContain("Use --force");
  expect(readFileSync(path, "utf8")).toBe("KEEP_EXISTING=true\n");
});
