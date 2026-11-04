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
import { cryptoRandom, systemClock } from "#/infra/runtime";
import {
  applyImportBatch,
  discardImportBatch,
  type ImportDeps,
  prepareImport,
  saveRoomMappings,
  saveTeacherMappings,
  suggestMappings,
} from "./import-actions.ts";

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
  const accounts = new Map<string, User>();
  for (const [token, roles] of [
    ["adm", ["admin"]],
    ["hor", ["horarios"]],
    ["doc", ["docente"]],
  ] as Array<[string, Role[]]>) {
    accounts.set(
      token,
      await users.create({
        email: `${token}@x.org`,
        name: token,
        code: token.toUpperCase(),
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
      spaces,
      users,
      clock: systemClock,
      hasher: {
        hash: async (p: string) => `hash:${p}`,
        verify: async () => false,
        needsRehash: () => false,
      },
      random: cryptoRandom,
    }),
    cookieSecure: "auto",
  };
  const semester = await semesters.create({
    name: "2026.2",
    start: "2026-08-03",
    end: "2026-12-19",
    terms: [
      { position: 1, start: "2026-08-03", end: "2026-09-12" },
      { position: 2, start: "2026-09-14", end: "2026-10-24" },
      { position: 3, start: "2026-10-26", end: "2026-12-05" },
    ],
    blocks: [],
  });
  const space = await spaces.create({ name: "Sala 1", capacity: null });
  const req = (token: string | null) => ({
    url: "https://reservas.ifsc.edu.br/_serverFn/x",
    headers: new Headers(token === null ? {} : { cookie: `sid=${token}` }),
  });
  return { deps, semester, space, req, accounts };
}

type Ctx = Awaited<ReturnType<typeof setup>>;

describe("ações de importação: controle de acesso", () => {
  let ctx: Ctx;
  beforeEach(async () => {
    ctx = await setup();
  });

  const calls: Array<
    [string, (c: Ctx, token: string | null) => Promise<{ response: { ok: boolean } }>]
  > = [
    [
      "suggestMappings",
      (c, t) => suggestMappings(c.deps, c.req(t), { classrooms: [], teachers: [] }),
    ],
    ["saveRoomMappings", (c, t) => saveRoomMappings(c.deps, c.req(t), { items: [] })],
    ["saveTeacherMappings", (c, t) => saveTeacherMappings(c.deps, c.req(t), { items: [] })],
    ["prepareImport", (c, t) => prepareImport(c.deps, c.req(t), c.semester.id, XML)],
    ["applyImportBatch", (c, t) => applyImportBatch(c.deps, c.req(t), { batchId: "x" })],
  ];

  for (const [name, call] of calls) {
    test(`${name}: 401 sem sessão, 403 para docente`, async () => {
      const anonymous = await call(ctx, null);
      expect(anonymous.response).toMatchObject({ ok: false, status: 401 });
      const docente = await call(ctx, "doc");
      expect(docente.response).toMatchObject({ ok: false, status: 403 });
    });

    test(`${name}: admin e horarios passam da autorização`, async () => {
      for (const token of ["adm", "hor"]) {
        const result = await call(ctx, token);
        const status = (result.response as { status?: number }).status;
        expect(status === undefined || (status !== 401 && status !== 403)).toBe(true);
      }
    });
  }
});

describe("ações de importação: fluxo", () => {
  let ctx: Ctx;
  beforeEach(async () => {
    ctx = await setup();
  });

  test("sugestões, vínculos, preparar, aplicar e relatório", async () => {
    const suggestions = await suggestMappings(ctx.deps, ctx.req("hor"), {
      classrooms: [{ id: "R1", short: "S1", name: "Sala 1" }],
      teachers: [{ id: "P1", short: "HOR" }],
    });
    expect(suggestions.response.ok && suggestions.response.data.rooms[0]?.suggestion?.origin).toBe(
      "nome",
    );
    expect(
      suggestions.response.ok && suggestions.response.data.teachers[0]?.suggestion?.origin,
    ).toBe("codigo");

    const rooms = await saveRoomMappings(ctx.deps, ctx.req("adm"), {
      items: [
        { sourceRoomId: "R1", sourceShort: "S1", spaceId: ctx.space.id, ignored: false },
        { sourceRoomId: "R2", sourceShort: "S2", spaceId: null, ignored: true },
      ],
    });
    expect(rooms.response.ok).toBe(true);
    const teachers = await saveTeacherMappings(ctx.deps, ctx.req("adm"), {
      items: [
        { sourceTeacherId: "P1", sourceShort: "HOR", userId: ctx.accounts.get("hor")?.id ?? null },
      ],
    });
    expect(teachers.response.ok).toBe(true);

    const prepared = await prepareImport(ctx.deps, ctx.req("hor"), ctx.semester.id, XML);
    expect(prepared.response.ok).toBe(true);
    if (!prepared.response.ok) return;
    const batchId = prepared.response.data.batch.id;
    expect(prepared.response.data.reused).toBe(false);

    const applied = await applyImportBatch(ctx.deps, ctx.req("hor"), { batchId });
    expect(applied.response.ok && applied.response.data.batch.status).toBe("aplicado");

    const again = await prepareImport(ctx.deps, ctx.req("hor"), ctx.semester.id, XML);
    expect(again.response.ok && again.response.data.reused).toBe(true);

    // outro arquivo (bytes diferentes, mesma grade) é uma nova versão: devolve o resumo da diferença
    const changed = new Uint8Array([...XML, ...new TextEncoder().encode("\n<!-- v2 -->")]);
    const next = await prepareImport(ctx.deps, ctx.req("hor"), ctx.semester.id, changed);
    expect(next.response.ok).toBe(true);
    if (!next.response.ok) return;
    expect(next.response.data.reused).toBe(false);
    expect(next.response.data.batch.supersedesBatchId).toBe(batchId);
    const version = next.response.data.batch.summary.version;
    expect(version?.supersedesBatchId).toBe(batchId);
    expect(version?.inalteradas).toBeGreaterThan(0);
    expect(version).toMatchObject({ inclusoes: 0, alteracoes: 0, remocoes: 0, responsaveis: 0 });
    expect(version?.affectedUserIds).toEqual([]);
    const reapplied = await applyImportBatch(ctx.deps, ctx.req("hor"), {
      batchId: next.response.data.batch.id,
    });
    expect(reapplied.response.ok && reapplied.response.data.batch.status).toBe("aplicado");
  });

  test("descartar: rascunho sai, aplicado é recusado, corpo inválido e docente são barrados", async () => {
    await saveRoomMappings(ctx.deps, ctx.req("adm"), {
      items: [{ sourceRoomId: "R1", sourceShort: "S1", spaceId: ctx.space.id, ignored: false }],
    });
    const prepared = await prepareImport(ctx.deps, ctx.req("hor"), ctx.semester.id, XML);
    if (!prepared.response.ok) throw new Error("prepare");
    const batchId = prepared.response.data.batch.id;
    expect((await discardImportBatch(ctx.deps, ctx.req("doc"), { batchId })).response.ok).toBe(
      false,
    );
    expect((await discardImportBatch(ctx.deps, ctx.req("hor"), {})).response.ok).toBe(false);
    expect((await discardImportBatch(ctx.deps, ctx.req("hor"), { batchId })).response.ok).toBe(
      true,
    );
    const again = await prepareImport(ctx.deps, ctx.req("hor"), ctx.semester.id, XML);
    if (!again.response.ok) throw new Error("prepare");
    await applyImportBatch(ctx.deps, ctx.req("hor"), { batchId: again.response.data.batch.id });
    const refused = await discardImportBatch(ctx.deps, ctx.req("hor"), {
      batchId: again.response.data.batch.id,
    });
    expect(refused.response.ok).toBe(false);
  });

  test("corpos inválidos: 400", async () => {
    const bad = (r: { response: { ok: boolean } }) => r.response;
    const t = ctx.req("adm");
    expect(bad(await suggestMappings(ctx.deps, t, null))).toMatchObject({ status: 400 });
    expect(
      bad(await suggestMappings(ctx.deps, t, { classrooms: [{ id: 1 }], teachers: [] })),
    ).toMatchObject({ status: 400 });
    expect(
      bad(await suggestMappings(ctx.deps, t, { classrooms: [], teachers: [{ id: "a" }] })),
    ).toMatchObject({ status: 400 });
    expect(
      bad(await saveRoomMappings(ctx.deps, t, { items: [{ sourceRoomId: "a" }] })),
    ).toMatchObject({ status: 400 });
    expect(bad(await saveRoomMappings(ctx.deps, t, {}))).toMatchObject({ status: 400 });
    expect(
      bad(
        await saveRoomMappings(ctx.deps, t, {
          items: [{ sourceRoomId: "a", sourceShort: "b", spaceId: 3, ignored: false }],
        }),
      ),
    ).toMatchObject({ status: 400 });
    expect(
      bad(await saveTeacherMappings(ctx.deps, t, { items: [{ sourceTeacherId: "a" }] })),
    ).toMatchObject({ status: 400 });
    expect(
      bad(
        await saveTeacherMappings(ctx.deps, t, {
          items: [{ sourceTeacherId: "a", sourceShort: "b", userId: 3 }],
        }),
      ),
    ).toMatchObject({ status: 400 });
    expect(bad(await prepareImport(ctx.deps, t, "", XML))).toMatchObject({ status: 400 });
    expect(bad(await prepareImport(ctx.deps, t, ctx.semester.id, new Uint8Array()))).toMatchObject({
      status: 400,
    });
    expect(
      bad(await prepareImport(ctx.deps, t, ctx.semester.id, new TextEncoder().encode("não é xml"))),
    ).toMatchObject({ status: 400 });
    expect(bad(await prepareImport(ctx.deps, t, "nao-existe", XML))).toMatchObject({ status: 404 });
    expect(bad(await applyImportBatch(ctx.deps, t, {}))).toMatchObject({ status: 400 });
    expect(bad(await applyImportBatch(ctx.deps, t, { batchId: "nao-existe" }))).toMatchObject({
      status: 404,
    });
  });

  test("prepare e apply só aceitam orçamento inteiro dentro do limite", async () => {
    const t = ctx.req("adm");
    for (const bad of [0, 1.5, 1000, "3"]) {
      const r = await applyImportBatch(ctx.deps, t, { batchId: "x", maxChunks: bad });
      expect(r.response).toMatchObject({ ok: false, status: 400 });
      const p = await prepareImport(ctx.deps, t, ctx.semester.id, XML, bad as number);
      expect(p.response).toMatchObject({ ok: false, status: 400 });
    }
  });

  test("passo a passo: prepare e apply com orçamento devolvem progresso", async () => {
    await saveRoomMappings(ctx.deps, ctx.req("adm"), {
      items: [{ sourceRoomId: "R1", sourceShort: "S1", spaceId: ctx.space.id, ignored: false }],
    });
    const p = await prepareImport(ctx.deps, ctx.req("hor"), ctx.semester.id, XML, 1);
    expect(p.response.ok && typeof p.response.data.remaining).toBe("number");
    expect(p.response.ok && typeof p.response.data.done).toBe("boolean");
    if (!p.response.ok) return;
    const a = await applyImportBatch(ctx.deps, ctx.req("hor"), {
      batchId: p.response.data.batch.id,
      maxChunks: 1,
    });
    expect(a.response.ok || a.response.status === 409).toBe(true);
  });

  test("docentes: nome vai para a sugestão e criar fantasma é aceito", async () => {
    const t = ctx.req("hor");
    const suggestions = await suggestMappings(ctx.deps, t, {
      classrooms: [],
      teachers: [{ id: "P9", short: "ZQ", name: "Zeca Quintal" }],
    });
    expect(suggestions.response.ok && suggestions.response.data.teachers[0]).toMatchObject({
      name: "Zeca Quintal",
      defaultAction: "fantasma",
    });
    const saved = await saveTeacherMappings(ctx.deps, t, {
      items: [
        {
          sourceTeacherId: "P9",
          sourceShort: "ZQ",
          userId: null,
          createPlaceholder: { name: "Zeca Quintal" },
        },
      ],
    });
    expect(saved.response).toEqual({ ok: true, data: null });
    const again = await suggestMappings(ctx.deps, t, {
      classrooms: [],
      teachers: [{ id: "P9", short: "ZQ", name: "Zeca Quintal" }],
    });
    expect(again.response.ok && again.response.data.teachers[0]?.defaultAction).toBe("salvo");
  });

  test("docentes: criar fantasma ou nome com formato inválido é 400", async () => {
    const t = ctx.req("adm");
    const base = { sourceTeacherId: "P1", sourceShort: "ZQ", userId: null };
    for (const createPlaceholder of ["Zeca", null, [], { name: 3 }, {}]) {
      const result = await saveTeacherMappings(ctx.deps, t, {
        items: [{ ...base, createPlaceholder }],
      });
      expect(result.response).toMatchObject({ ok: false, status: 400 });
    }
    const badName = await suggestMappings(ctx.deps, t, {
      classrooms: [],
      teachers: [{ id: "P1", short: "ZQ", name: 3 }],
    });
    expect(badName.response).toMatchObject({ ok: false, status: 400 });
    const both = await saveTeacherMappings(ctx.deps, t, {
      items: [{ ...base, userId: ctx.accounts.get("hor")?.id, createPlaceholder: { name: "Z" } }],
    });
    expect(both.response).toMatchObject({ ok: false, status: 400, field: "userId" });
  });

  test("falha de validação do serviço volta como 400 com o campo", async () => {
    const result = await saveRoomMappings(ctx.deps, ctx.req("adm"), {
      items: [{ sourceRoomId: "R1", sourceShort: "S1", spaceId: "nao-existe", ignored: false }],
    });
    expect(result.response).toMatchObject({ ok: false, status: 400, field: "spaceId" });
  });
});
