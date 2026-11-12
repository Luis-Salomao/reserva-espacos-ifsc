import { describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { createBookingsService } from "#/application/bookings";
import { createNoticesService } from "#/application/notifications";
import { createRoomRequestsService } from "#/application/room-requests";
import type { Role } from "#/domain/user";
import { createNotificationRepository } from "#/infra/db/repos/notification-repository";
import { createOccupationRepository } from "#/infra/db/repos/occupation-repository";
import { createRoomRequestRepository } from "#/infra/db/repos/room-request-repository";
import { createSemesterRepository } from "#/infra/db/repos/semester-repository";
import { createSpaceRepository } from "#/infra/db/repos/space-repository";
import { createUserRepository } from "#/infra/db/repos/user-repository";
import * as schema from "#/infra/db/schema";

/**
 * Avisos e pedidos de sala no D1 local (workerd via getPlatformProxy), só com `RUN_D1_TESTS=1`:
 *   RUN_D1_TESTS=1 bun test src/infra/db/flow/room-requests-d1.test.ts
 * Fica fora do `bun run check` (lento, depende do workerd). O estado do D1 é uma pasta temporária;
 * nada toca a Cloudflare remota. Confere que a migração 0014 vale no D1 e que o `accept` em cadeia
 * (db.batch) cria uma única ocupação nova.
 */
const enabled = process.env.RUN_D1_TESTS === "1";

describe("avisos e pedidos no D1 local", () => {
  test.skipIf(!enabled)(
    "aviso de cancelamento, pedido, aceite concorrente e índice único",
    async () => {
      const nativeSetTimeout = globalThis.setTimeout;
      globalThis.setTimeout = ((...args: Parameters<typeof setTimeout>) => {
        const timer = nativeSetTimeout(...args) as ReturnType<typeof setTimeout> & {
          unref?: () => unknown;
        };
        timer.unref ??= () => timer;
        return timer;
      }) as typeof setTimeout;
      const { getPlatformProxy } = await import("wrangler");
      const persist = mkdtempSync(join(tmpdir(), "d1-avisos-"));
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
        const now = new Date("2026-11-03T12:00:00Z");
        const clock = { now: () => now };
        const timeZone = "America/Sao_Paulo";
        const occupations = createOccupationRepository(db);
        const requests = createRoomRequestRepository(db);
        const notifications = createNotificationRepository(db);
        const bookings = createBookingsService({
          occupations,
          spaces: createSpaceRepository(db),
          semesters: createSemesterRepository(db),
          users,
          clock,
          timeZone,
          hours: { opens: "06:00", closes: "23:00" },
        });
        const rooms = createRoomRequestsService({
          occupations,
          users,
          spaces: createSpaceRepository(db),
          requests,
          clock,
          timeZone,
        });
        const notices = createNoticesService({ notifications, requests, clock, timeZone });
        const book = async (date: string) => {
          const created = await bookings.createBooking(docB, {
            spaceId: space.id,
            date,
            start: "10:00",
            end: "11:00",
            purpose: "Reunião de B",
          });
          if (!created.ok) throw new Error(created.message);
          return created.value.id;
        };

        // Admin cancela a reserva de B: um aviso, com o motivo.
        const cancelled = await book("2026-11-10");
        expect(
          await bookings.cancelOccupation(admin, {
            occupationId: cancelled,
            scope: "data",
            note: "Obra na sala",
          }),
        ).toEqual({ ok: true, value: { cancelled: 1 } });
        const sent = await notifications.listFor(docB.id, 10);
        expect(sent).toHaveLength(1);
        expect(sent[0]?.data.note).toBe("Obra na sala");

        // Pedido, repetição barrada e aceites concorrentes.
        const id = await book("2026-11-11");
        const first = await rooms.request(docA, { occupationId: id, purpose: "Prova de A" });
        const second = await rooms.request(admin, { occupationId: id, purpose: "Reunião" });
        if (!first.ok || !second.ok) throw new Error("pedidos");
        expect(await rooms.request(docA, { occupationId: id, purpose: "De novo" })).toMatchObject({
          ok: false,
          kind: "conflict",
        });
        const race = await Promise.all([
          rooms.accept(docB, first.value.id),
          rooms.accept(docB, first.value.id),
          rooms.accept(docB, second.value.id),
        ]);
        expect(race.filter((result) => result.ok)).toHaveLength(1);
        const active = await db
          .select()
          .from(schema.occupations)
          .where(eq(schema.occupations.status, "ativa"));
        expect(active).toHaveLength(1);
        expect(active[0]).toMatchObject({ source: "manual", startsAt: "2026-11-11T10:00" });
        const statuses = (await db.select().from(schema.roomRequests))
          .map((row) => row.status)
          .sort();
        expect(statuses).toEqual(["aceito", "encerrado"]);
        expect(await notices.badge(docB)).toBeGreaterThanOrEqual(0);
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
