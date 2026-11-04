import { describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/d1";
import { createSpaceRepository } from "#/infra/db/repos/space-repository";
import * as schema from "#/infra/db/schema";

/**
 * Equipamentos no D1 (workerd local via getPlatformProxy), só com `RUN_D1_TESTS=1`:
 *   RUN_D1_TESTS=1 bun test src/infra/db/flow/space-d1.test.ts
 * Fica fora do `bun run check` (lento, depende do workerd). O estado do D1 é uma pasta temporária.
 */
const enabled = process.env.RUN_D1_TESTS === "1";

describe("equipamentos no D1 local", () => {
  test.skipIf(!enabled)(
    "migração com espaço antigo, gravação atômica e leitura",
    async () => {
      // No bun:test o setTimeout devolve um objeto sem `unref`, que o miniflare chama ao parar.
      const nativeSetTimeout = globalThis.setTimeout;
      globalThis.setTimeout = ((...args: Parameters<typeof setTimeout>) => {
        const timer = nativeSetTimeout(...args) as ReturnType<typeof setTimeout> & {
          unref?: () => unknown;
        };
        timer.unref ??= () => timer;
        return timer;
      }) as typeof setTimeout;
      const { getPlatformProxy } = await import("wrangler");
      const persist = mkdtempSync(join(tmpdir(), "d1-space-"));
      const proxy = await getPlatformProxy({
        configPath: join(import.meta.dir, "../../../../wrangler.jsonc"),
        persist: { path: persist },
      });
      try {
        const d1 = (proxy.env as unknown as { DB: D1Database }).DB;
        const dir = join(import.meta.dir, "../../../../drizzle");
        const files = readdirSync(dir)
          .filter((name) => name.endsWith(".sql"))
          .sort();
        const run = async (file: string) => {
          for (const statement of readFileSync(join(dir, file), "utf8").split(
            "--> statement-breakpoint",
          )) {
            if (statement.trim() !== "") await d1.prepare(statement).run();
          }
        };
        for (const file of files.filter((name) => name < "0009")) await run(file);
        await d1
          .prepare(
            "INSERT INTO spaces (id, name, capacity, created_at) VALUES ('antigo', 'A-202', 40, 't')",
          )
          .run();
        for (const file of files.filter((name) => name >= "0009")) await run(file);

        const repo = createSpaceRepository(drizzle(d1, { schema }));
        expect(await repo.listWithEquipment()).toEqual([
          {
            id: "antigo",
            name: "A-202",
            capacity: 40,
            equipment: { items: {}, notes: null },
          },
        ]);

        const equipment = { items: { projetor: 1, computadores: 0 }, notes: "Lousa" };
        const lab = await repo.create({ name: "Lab 1", capacity: 20, equipment });
        await expect(
          repo.update(lab.id, {
            name: "A-202",
            capacity: 1,
            equipment: { items: { som: 1 }, notes: null },
          }),
        ).rejects.toThrow();
        await repo.update("antigo", {
          name: "A-202",
          capacity: 40,
          equipment: { items: { som: 1 }, notes: null },
        });
        expect(await repo.listWithEquipment()).toEqual([
          {
            id: "antigo",
            name: "A-202",
            capacity: 40,
            equipment: { items: { som: 1 }, notes: null },
          },
          { id: lab.id, name: "Lab 1", capacity: 20, equipment },
        ]);

        await d1
          .prepare(
            "INSERT INTO occupations (id, space_id, starts_at, ends_at, source, title, status, created_at) VALUES ('o1', 'antigo', '2026-11-10T10:00', '2026-11-10T11:00', 'manual', 'Aula', 'cancelada', 't')",
          )
          .run();
        expect(await repo.remove("antigo")).toBe("in_use");
        expect(await repo.remove(lab.id)).toBe("removed");
        expect(await repo.remove(lab.id)).toBe("not_found");
        expect((await repo.listWithEquipment()).map((space) => space.id)).toEqual(["antigo"]);
      } finally {
        await proxy.dispose();
        await new Promise((resolve) => nativeSetTimeout(resolve, 50));
        globalThis.setTimeout = nativeSetTimeout;
        try {
          rmSync(persist, { recursive: true, force: true });
        } catch {
          // pasta temporária; o Windows pode segurar arquivos abertos
        }
      }
    },
    60_000,
  );
});
