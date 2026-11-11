import { expect, test } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/d1";
import { createPasswordRecoveryRepository } from "#/infra/db/repos/password-recovery-repository";
import { createUserRepository } from "#/infra/db/repos/user-repository";
import * as schema from "#/infra/db/schema";

test.skipIf(process.env.RUN_D1_TESTS !== "1")(
  "D1 local: consumo único atômico, senha e sessões, criação junto à outbox",
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
    const persist = mkdtempSync(join(tmpdir(), "d1-recovery-"));
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
      const user = await createUserRepository(db).create({
        email: "a@example.org",
        name: "A",
        code: null,
        roles: ["docente"],
        passwordHash: "old",
      });
      await d1
        .prepare(
          "INSERT INTO sessions(id,user_id,token_hash,created_at,expires_at,last_seen_at) VALUES('s',?,'h','a','z','a')",
        )
        .bind(user.id)
        .run();
      const repository = createPasswordRecoveryRepository(db);
      const now = "2026-11-09T12:00:00.000Z";
      await repository.create({
        id: "r",
        userId: user.id,
        tokenHash: "hash-only",
        createdAt: now,
        expiresAt: "2026-11-09T12:20:00.000Z",
        mail: {
          id: "mail",
          payload: "encrypted-fixture",
          createdAt: now,
          expiresAt: "2026-11-09T12:20:00.000Z",
        },
      });
      const race = await Promise.all(
        ["a", "b"].map((claimId) =>
          repository.consume({ tokenHash: "hash-only", passwordHash: claimId, now, claimId }),
        ),
      );
      expect(race.filter(Boolean)).toHaveLength(1);
      expect(await d1.prepare("SELECT count(*) AS n FROM sessions").first("n")).toBe(0);
      expect(["a", "b"]).toContain(
        (await createUserRepository(db).findByEmail(user.email))?.passwordHash ?? "",
      );
      expect(await d1.prepare("SELECT count(*) AS n FROM mail_outbox").first("n")).toBe(1);
      const admitted = await Promise.all(
        Array.from({ length: 10 }, (_, n) =>
          repository.allowRequest({
            id: `req${n}`,
            emailHash: "e",
            clientHash: `c${n}`,
            now,
            since: "2026-11-09T11:00:00.000Z",
          }),
        ),
      );
      expect(admitted.filter(Boolean)).toHaveLength(5);
    } finally {
      await proxy.dispose();
      globalThis.setTimeout = nativeSetTimeout;
      try {
        rmSync(persist, { recursive: true, force: true });
      } catch {
        /* Pasta temporária com handles ainda abertos no Windows. */
      }
    }
  },
  60_000,
);
