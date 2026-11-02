import { Database } from "bun:sqlite";
import { beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { createImportService } from "#/application/import-apply";
import { createMappingsService } from "#/application/import-mappings";
import type { Role, User } from "#/domain/user";
import { createImportRepository } from "#/infra/db/repos/import-repository";
import { createMappingRepositories } from "#/infra/db/repos/mapping-repositories";
import { createSemesterRepository } from "#/infra/db/repos/semester-repository";
import { createSpaceRepository } from "#/infra/db/repos/space-repository";
import { createUserRepository } from "#/infra/db/repos/user-repository";
import * as schema from "#/infra/db/schema";
import { systemClock } from "#/infra/runtime";
import type { ImportDeps } from "./import-actions.ts";
import { applyImportBatch } from "./import-actions.ts";
import { handlePrepareRequest } from "./import-prepare.ts";

const XML = readFileSync(join(import.meta.dir, "../../test/fixtures/asc/complete.xml"));

async function setup() {
  const sqlite = new Database(":memory:");
  sqlite.run("PRAGMA foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "drizzle" });
  const users = createUserRepository(db);
  const semesters = createSemesterRepository(db);
  const maps = createMappingRepositories(db);
  const accounts = new Map<string, User>();
  for (const [token, roles] of [
    ["hor", ["horarios"]],
    ["doc", ["docente"]],
  ] as Array<[string, Role[]]>) {
    accounts.set(
      token,
      await users.create({
        email: `${token}@x.org`,
        name: token,
        code: null,
        roles,
        passwordHash: "x",
      }),
    );
  }
  const deps: ImportDeps = {
    auth: {
      login: async () => ({ ok: false, reason: "invalid" }),
      authenticate: async (token) => accounts.get(token) ?? null,
      logout: async () => {},
    },
    imports: createImportService({
      imports: createImportRepository(db),
      rooms: maps.rooms,
      teachers: maps.teachers,
      semesters,
      clock: systemClock,
    }),
    mappings: createMappingsService({
      rooms: maps.rooms,
      teachers: maps.teachers,
      spaces: createSpaceRepository(db),
      users,
      clock: systemClock,
    }),
    cookieSecure: "auto",
  };
  const semester = await semesters.create({
    name: "2026.2",
    start: "2026-08-03",
    end: "2026-12-19",
    terms: [{ position: 1, start: "2026-08-03", end: "2026-09-12" }],
    blocks: [],
  });
  const post = (query: string, token: string | null, body: BlobPart = XML) => {
    const size = new Blob([body]).size;
    return {
      url: `https://reservas.ifsc.edu.br/api/import-prepare${query}`,
      headers: new Headers({
        "content-length": String(size),
        ...(token === null ? {} : { cookie: `sid=${token}` }),
      }),
      body: new Response(body).body,
    };
  };
  return { deps, semester, post };
}

type Json = { ok: boolean; message?: string; data: { done: boolean; reused: boolean } };

describe("POST de preparo do lote", () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    ctx = await setup();
  });

  test("sem sessão 401, docente 403", async () => {
    const query = `?semesterId=${ctx.semester.id}`;
    expect((await handlePrepareRequest(ctx.post(query, null), ctx.deps)).status).toBe(401);
    expect((await handlePrepareRequest(ctx.post(query, "doc"), ctx.deps)).status).toBe(403);
  });

  test("prepara em passos e reconhece o mesmo arquivo depois", async () => {
    const query = `?semesterId=${ctx.semester.id}&maxCalls=1`;
    const response = await handlePrepareRequest(ctx.post(query, "hor"), ctx.deps);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = (await response.json()) as Json;
    expect(body.ok).toBe(true);
    expect(body.data.done).toBe(true);
    const applied = await applyImportBatch(
      ctx.deps,
      { url: "https://reservas.ifsc.edu.br/x", headers: new Headers({ cookie: "sid=hor" }) },
      { batchId: (body.data as unknown as { batch: { id: string } }).batch.id },
    );
    expect(applied.response.ok).toBe(true);
    const again = (await (
      await handlePrepareRequest(ctx.post(query, "hor"), ctx.deps)
    ).json()) as Json;
    expect(again.data.reused).toBe(true);
  });

  test("entradas inválidas viram erro tipado, sem estourar", async () => {
    const id = ctx.semester.id;
    const cases: Array<[string, BlobPart]> = [
      ["", XML],
      ["?semesterId=", XML],
      [`?semesterId=${id}&maxCalls=abc`, XML],
      [`?semesterId=${id}&maxCalls=0`, XML],
      [`?semesterId=${id}`, ""],
      [`?semesterId=${id}`, "<nao-e-asc/>"],
      ["?semesterId=nao-existe", XML],
    ];
    for (const [query, body] of cases) {
      const response = await handlePrepareRequest(ctx.post(query, "hor", body), ctx.deps);
      expect(response.status).toBe(200);
      const json = (await response.json()) as Json;
      expect(json.ok).toBe(false);
      expect(typeof json.message).toBe("string");
    }
  });

  test("recusa arquivo acima de 10 MB", async () => {
    const big = new Uint8Array(10 * 1024 * 1024 + 1);
    const response = await handlePrepareRequest(
      ctx.post(`?semesterId=${ctx.semester.id}`, "hor", big),
      ctx.deps,
    );
    const json = (await response.json()) as Json;
    expect(json.ok).toBe(false);
    expect(json.message).toContain("10 MB");
  });
});
