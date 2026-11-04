import { describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/d1";
import { createBookingsService } from "#/application/bookings";
import type { Role } from "#/domain/user";
import { createOccupationRepository } from "#/infra/db/repos/occupation-repository";
import { createSemesterRepository } from "#/infra/db/repos/semester-repository";
import { createSpaceRepository } from "#/infra/db/repos/space-repository";
import { createUserRepository } from "#/infra/db/repos/user-repository";
import * as schema from "#/infra/db/schema";

/**
 * Regressão no D1 (workerd local via getPlatformProxy), só com `RUN_D1_TESTS=1`:
 *   RUN_D1_TESTS=1 bun test src/infra/db/flow/booking-d1.test.ts
 * Fica fora do `bun run check` (lento, depende do workerd). Não toca na Cloudflare remota: o
 * estado do D1 é uma pasta temporária.
 */
const enabled = process.env.RUN_D1_TESTS === "1";

describe("reservas no D1 local", () => {
  test.skipIf(!enabled)(
    "criar, conflito, corrida, cancelar e série por posse",
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
      const persist = mkdtempSync(join(tmpdir(), "d1-booking-"));
      const proxy = await getPlatformProxy({
        configPath: join(import.meta.dir, "../../../../wrangler.jsonc"),
        persist: { path: persist },
      });
      try {
        const d1 = (proxy.env as unknown as { DB: D1Database }).DB;
        const dir = join(import.meta.dir, "../../../../drizzle");
        for (const file of readdirSync(dir)
          .filter((name) => name.endsWith(".sql"))
          .sort()) {
          for (const statement of readFileSync(join(dir, file), "utf8").split(
            "--> statement-breakpoint",
          )) {
            if (statement.trim() !== "") await d1.prepare(statement).run();
          }
        }
        const db = drizzle(d1, { schema });
        const users = createUserRepository(db);
        const account = (token: string, roles: Role[]) =>
          users.create({
            email: `${token}@x.org`,
            name: token,
            code: token.toUpperCase(),
            roles,
            passwordHash: "x",
          });
        const admin = await account("adm", ["admin"]);
        const docA = await account("doca", ["docente"]);
        const docB = await account("docb", ["docente"]);
        const space = await createSpaceRepository(db).create({ name: "ADM 2", capacity: 30 });
        const service = createBookingsService({
          occupations: createOccupationRepository(db),
          spaces: createSpaceRepository(db),
          semesters: createSemesterRepository(db),
          users,
          clock: { now: () => new Date("2026-11-03T12:00:00Z") },
          timeZone: "America/Sao_Paulo",
          hours: { opens: "06:00", closes: "23:00" },
        });
        const slot = (start: string, end: string, purpose: string) => ({
          spaceId: space.id,
          date: "2026-11-10",
          start,
          end,
          purpose,
        });

        const race = await Promise.all([
          service.createBooking(docA, slot("10:00", "11:00", "A")),
          service.createBooking(docB, slot("10:30", "11:30", "B")),
          service.createBooking(admin, slot("09:30", "10:30", "C")),
        ]);
        expect(race.filter((result) => result.ok)).toHaveLength(1);
        expect(race.filter((result) => !result.ok && result.kind === "conflict")).toHaveLength(2);
        const winner = race.find((result) => result.ok);
        if (winner === undefined || !winner.ok) throw new Error("sem vencedora");

        expect((await service.createBooking(docA, slot("11:00", "12:00", "Adjacente"))).ok).toBe(
          true,
        );
        expect(
          await service.cancelOccupation(admin, { occupationId: winner.value.id, scope: "data" }),
        ).toEqual({ ok: true, value: { cancelled: 1 } });
        const again = await service.createBooking(docB, slot("10:00", "11:00", "Depois"));
        expect(again.ok).toBe(true);

        // Série importada: docA só alcança as próprias datas; o admin, todas.
        const batchId = "b-d1";
        const semester = await createSemesterRepository(db).create({
          name: "2026/2",
          start: "2026-08-03",
          end: "2026-12-18",
          terms: [],
          blocks: [],
        });
        await d1
          .prepare(
            "INSERT INTO import_batches (id, semester_id, file_hash, summary_json, status, created_by, created_at) VALUES (?, ?, 'h', '{}', 'aplicado', ?, '2026-08-01T00:00:00.000Z')",
          )
          .bind(batchId, semester.id, admin.id)
          .run();
        const owners = [docA.id, docB.id, docA.id];
        const dates = ["2026-11-17", "2026-11-24", "2026-12-01"];
        for (const [index, owner] of owners.entries()) {
          await d1
            .prepare(
              "INSERT INTO occupations (id, space_id, starts_at, ends_at, source, batch_id, lesson_id, responsible_user_id, title, status, created_at) VALUES (?, ?, ?, ?, 'import', ?, 'L1', ?, 'MAT1', 'ativa', '2026-08-01T00:00:00.000Z')",
            )
            .bind(
              `s${index}`,
              space.id,
              `${dates[index]}T14:00`,
              `${dates[index]}T15:00`,
              batchId,
              owner,
            )
            .run();
        }
        expect(await service.previewSeries(docA, "s0")).toEqual({
          ok: true,
          value: { dates: ["2026-11-17", "2026-12-01"] },
        });
        expect(await service.previewSeries(admin, "s0")).toEqual({
          ok: true,
          value: { dates: ["2026-11-17", "2026-11-24", "2026-12-01"] },
        });
        expect(
          await service.cancelOccupation(docA, { occupationId: "s0", scope: "serie" }),
        ).toEqual({ ok: true, value: { cancelled: 2 } });
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
