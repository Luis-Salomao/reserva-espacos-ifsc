import { Database } from "bun:sqlite";
import { beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { createImportService } from "#/application/import-apply";
import { createMappingsService } from "#/application/import-mappings";
import { createImportReportService } from "#/application/import-report";
import { createSemestersService } from "#/application/semesters";
import { createSpacesService } from "#/application/spaces";
import { createUsersService } from "#/application/users";
import type { Role, User } from "#/domain/user";
import { createImportRepository } from "#/infra/db/repos/import-repository";
import { createMappingRepositories } from "#/infra/db/repos/mapping-repositories";
import { createSemesterRepository } from "#/infra/db/repos/semester-repository";
import { createSessionRepository } from "#/infra/db/repos/session-repository";
import { createSpaceRepository } from "#/infra/db/repos/space-repository";
import { createUserRepository } from "#/infra/db/repos/user-repository";
import * as schema from "#/infra/db/schema";
import { systemClock } from "#/infra/runtime";
import { prepareImport } from "./import-actions.ts";
import {
  createImportSpace,
  getImportRows,
  getImportTargets,
  type ImportFlowDeps,
  listImportBatches,
} from "./import-flow.ts";

const XML = new Uint8Array(
  readFileSync(join(import.meta.dir, "../../test/fixtures/asc/complete.xml")),
);

async function setup() {
  const sqlite = new Database(":memory:");
  sqlite.run("PRAGMA foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "drizzle" });
  const users = createUserRepository(db);
  const spaces = createSpaceRepository(db);
  const semesters = createSemesterRepository(db);
  const maps = createMappingRepositories(db);
  const imports = createImportRepository(db);
  const accounts = new Map<string, User>();
  for (const [token, roles, code] of [
    ["adm", ["admin"], "ADM"],
    ["hor", ["horarios"], null],
    ["doc", ["docente"], "DOC"],
  ] as Array<[string, Role[], string | null]>) {
    accounts.set(
      token,
      await users.create({
        email: `${token}@x.org`,
        name: token,
        code,
        roles,
        passwordHash: "x",
      }),
    );
  }
  const hasher = {
    hash: async () => "h",
    verify: async () => true,
    needsRehash: () => false,
  };
  const deps: ImportFlowDeps = {
    auth: {
      login: async () => ({ ok: false, reason: "invalid" }),
      authenticate: async (token) => accounts.get(token) ?? null,
      logout: async () => {},
    },
    imports: createImportService({
      imports,
      rooms: maps.rooms,
      teachers: maps.teachers,
      semesters,
      clock: systemClock,
    }),
    mappings: createMappingsService({
      rooms: maps.rooms,
      teachers: maps.teachers,
      spaces,
      users,
      clock: systemClock,
    }),
    report: createImportReportService({ imports, spaces, users, semesters }),
    spaces: createSpacesService({ spaces }),
    semesters: createSemestersService({ semesters }),
    users: createUsersService({ users, sessions: createSessionRepository(db), hasher }),
    cookieSecure: "auto",
  };
  const semester = await semesters.create({
    name: "2026.2",
    start: "2026-08-03",
    end: "2026-12-19",
    terms: [{ position: 1, start: "2026-08-03", end: "2026-09-12" }],
    blocks: [],
  });
  const req = (token: string | null) => ({
    url: "https://reservas.ifsc.edu.br/_serverFn/x",
    headers: new Headers(token === null ? {} : { cookie: `sid=${token}` }),
  });
  return { deps, semester, req };
}

type Ctx = Awaited<ReturnType<typeof setup>>;

describe("ações do fluxo de importação: acesso", () => {
  let ctx: Ctx;
  beforeEach(async () => {
    ctx = await setup();
  });
  const calls: Array<[string, (c: Ctx, t: string | null) => Promise<{ response: unknown }>]> = [
    ["getImportTargets", (c, t) => getImportTargets(c.deps, c.req(t))],
    ["createImportSpace", (c, t) => createImportSpace(c.deps, c.req(t), { name: "Sala X" })],
    ["getImportRows", (c, t) => getImportRows(c.deps, c.req(t), { batchId: "x" })],
    ["listImportBatches", (c, t) => listImportBatches(c.deps, c.req(t))],
  ];
  for (const [name, call] of calls) {
    test(`${name}: 401 sem sessão e 403 para docente`, async () => {
      expect((await call(ctx, null)).response).toMatchObject({ ok: false, status: 401 });
      expect((await call(ctx, "doc")).response).toMatchObject({ ok: false, status: 403 });
    });
  }
});

describe("ações do fluxo de importação", () => {
  let ctx: Ctx;
  beforeEach(async () => {
    ctx = await setup();
  });

  test("alvos: semestres, espaços e só contas ativas sem e-mail nem papéis", async () => {
    const { response } = await getImportTargets(ctx.deps, ctx.req("hor"));
    if (!response.ok) throw new Error(response.message);
    expect(response.data.semesters.map((semester) => semester.name)).toEqual(["2026.2"]);
    expect(response.data.accounts.map((account) => account.name).sort()).toEqual([
      "adm",
      "doc",
      "hor",
    ]);
    expect(JSON.stringify(response.data.accounts)).not.toContain("@");
    expect(JSON.stringify(response.data.accounts)).not.toContain("roles");
  });

  test("criar espaço: horários pode; nome repetido ou vazio dá erro tipado", async () => {
    const created = await createImportSpace(ctx.deps, ctx.req("hor"), { name: "  Lab 9 " });
    expect(created.response).toMatchObject({ ok: true, data: { name: "Lab 9" } });
    const again = await createImportSpace(ctx.deps, ctx.req("hor"), { name: "lab 9" });
    expect(again.response).toMatchObject({ ok: false, status: 409, field: "name" });
    expect(
      (await createImportSpace(ctx.deps, ctx.req("hor"), { name: "" })).response,
    ).toMatchObject({ ok: false, status: 400 });
    expect((await createImportSpace(ctx.deps, ctx.req("hor"), {})).response).toMatchObject({
      ok: false,
      status: 400,
    });
  });

  test("linhas: valida entradas e devolve a página filtrada do lote", async () => {
    const prepared = await prepareImport(ctx.deps, ctx.req("hor"), ctx.semester.id, XML, 100);
    if (!prepared.response.ok) throw new Error(prepared.response.message);
    const batchId = prepared.response.data.batch.id;
    const bad = [
      { batchId: "" },
      { batchId, status: "inexistente" },
      { batchId, reasonCode: "" },
      { batchId, reasonCode: 3 },
      { batchId, search: "x".repeat(101) },
      { batchId, search: 4 },
      { batchId, limit: 0 },
      { batchId, offset: -1 },
      "texto",
    ];
    for (const data of bad) {
      expect((await getImportRows(ctx.deps, ctx.req("hor"), data)).response).toMatchObject({
        ok: false,
        status: 400,
      });
    }
    const all = await getImportRows(ctx.deps, ctx.req("hor"), { batchId, limit: 5 });
    if (!all.response.ok) throw new Error(all.response.message);
    expect(all.response.data.rows.length).toBeLessThanOrEqual(5);
    expect(all.response.data.total).toBe(prepared.response.data.batch.summary.rows);
    const filtered = await getImportRows(ctx.deps, ctx.req("hor"), {
      batchId,
      status: "nao_aplicavel",
      reasonCode: "room_unmapped",
      search: "a",
      offset: 0,
    });
    if (!filtered.response.ok) throw new Error(filtered.response.message);
    for (const row of filtered.response.data.rows) expect(row.reasonCode).toBe("room_unmapped");
    expect(
      (await getImportRows(ctx.deps, ctx.req("hor"), { batchId: "nada" })).response,
    ).toMatchObject({ ok: false, status: 404 });
  });

  test("lotes: lista o lote preparado com semestre e prefixo do hash", async () => {
    await prepareImport(ctx.deps, ctx.req("hor"), ctx.semester.id, XML, 100);
    const { response } = await listImportBatches(ctx.deps, ctx.req("adm"));
    if (!response.ok) throw new Error(response.message);
    expect(response.data).toHaveLength(1);
    expect(response.data[0]?.semesterName).toBe("2026.2");
    expect(response.data[0]?.hashPrefix).toHaveLength(8);
  });
});
