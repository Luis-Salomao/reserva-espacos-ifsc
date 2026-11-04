import { Database } from "bun:sqlite";
import { beforeEach, describe, expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { createAuthService } from "#/application/auth";
import { createSemestersService } from "#/application/semesters";
import { createSpacesService } from "#/application/spaces";
import { createUsersService } from "#/application/users";
import type { Role } from "#/domain/user";
import { createPasswordHasher } from "#/infra/auth/password-hasher";
import { createLoginAttemptRepository } from "#/infra/db/repos/login-attempt-repository";
import { createSemesterRepository } from "#/infra/db/repos/semester-repository";
import { createSessionRepository } from "#/infra/db/repos/session-repository";
import { createSpaceRepository } from "#/infra/db/repos/space-repository";
import { createUserRepository } from "#/infra/db/repos/user-repository";
import * as schema from "#/infra/db/schema";
import { cryptoRandom, systemClock } from "#/infra/runtime";
import {
  type AdminDeps,
  activatePlaceholderAccount,
  createAccount,
  createSemester,
  createSpace,
  deleteSpace,
  getSemester,
  listAccounts,
  listAdminSpaces,
  listSemesters,
  mergePlaceholderAccount,
  resetAccountPassword,
  setAccountActive,
  updateAccount,
  updateSemester,
  updateSpace,
} from "./admin-actions.ts";

const ADMIN_PASSWORD = "senha-falsa-admin-1"; // betterleaks:allow
const USER_PASSWORD = "senha-falsa-usuario-2"; // betterleaks:allow
const NEW_PASSWORD = "senha-falsa-nova-3"; // betterleaks:allow

async function setup() {
  const sqlite = new Database(":memory:");
  sqlite.run("PRAGMA foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "drizzle" });
  const users = createUserRepository(db);
  const sessions = createSessionRepository(db);
  const hasher = createPasswordHasher({ algorithm: "scrypt", scryptN: 1024 });
  const auth = createAuthService({
    users,
    sessions,
    hasher,
    attempts: createLoginAttemptRepository(db),
    clock: systemClock,
    random: cryptoRandom,
  });
  const deps: AdminDeps = {
    auth,
    users: createUsersService({ users, sessions, hasher }),
    spaces: createSpacesService({ spaces: createSpaceRepository(db) }),
    semesters: createSemestersService({ semesters: createSemesterRepository(db) }),
    cookieSecure: "auto",
  };

  async function account(email: string, roles: Role[], password: string, code: string | null) {
    const created = await users.create({
      email,
      name: email.split("@")[0] ?? "x",
      code,
      roles,
      passwordHash: await hasher.hash(password),
    });
    const login = await auth.login(email, password);
    if (!login.ok) throw new Error("login de teste falhou");
    return { id: created.id, token: login.token };
  }

  const admin = await account("admin@ifsc.edu.br", ["admin"], ADMIN_PASSWORD, "ADM");
  const horarios = await account("horarios@ifsc.edu.br", ["horarios"], USER_PASSWORD, "HOR");
  const docente = await account("docente@ifsc.edu.br", ["docente"], USER_PASSWORD, null);
  const req = (token: string | null) => ({
    url: "https://reservas.ifsc.edu.br/_serverFn/x",
    headers: new Headers(token === null ? {} : { cookie: `sid=${token}` }),
  });
  return { deps, auth, admin, horarios, docente, req, db };
}

type Ctx = Awaited<ReturnType<typeof setup>>;

const NEW_ACCOUNT = {
  email: "Nova@IFSC.edu.br",
  name: "Nova Pessoa",
  code: "NOVA",
  roles: ["docente"],
  password: NEW_PASSWORD,
};

describe("controle de acesso no servidor", () => {
  let ctx: Ctx;
  beforeEach(async () => {
    ctx = await setup();
  });

  const calls: Array<[string, (c: Ctx, token: string | null) => Promise<unknown>]> = [
    ["listAccounts", async (c, t) => (await listAccounts(c.deps, c.req(t))).response],
    [
      "createAccount",
      async (c, t) => (await createAccount(c.deps, c.req(t), NEW_ACCOUNT)).response,
    ],
    [
      "updateAccount",
      async (c, t) =>
        (
          await updateAccount(c.deps, c.req(t), {
            id: c.docente.id,
            name: "X",
            code: "",
            roles: ["admin"],
          })
        ).response,
    ],
    [
      "setAccountActive",
      async (c, t) =>
        (await setAccountActive(c.deps, c.req(t), { id: c.docente.id, active: false })).response,
    ],
    [
      "resetAccountPassword",
      async (c, t) =>
        (
          await resetAccountPassword(c.deps, c.req(t), {
            id: c.docente.id,
            password: NEW_PASSWORD,
          })
        ).response,
    ],
    [
      "activatePlaceholderAccount",
      async (c, t) =>
        (
          await activatePlaceholderAccount(c.deps, c.req(t), {
            id: c.docente.id,
            email: "nova@ifsc.edu.br",
            password: NEW_PASSWORD,
          })
        ).response,
    ],
    [
      "mergePlaceholderAccount",
      async (c, t) =>
        (
          await mergePlaceholderAccount(c.deps, c.req(t), {
            id: c.docente.id,
            targetId: c.horarios.id,
          })
        ).response,
    ],
    ["listAdminSpaces", async (c, t) => (await listAdminSpaces(c.deps, c.req(t))).response],
    [
      "createSpace",
      async (c, t) =>
        (await createSpace(c.deps, c.req(t), { name: "Sala", capacity: null })).response,
    ],
    [
      "updateSpace",
      async (c, t) =>
        (await updateSpace(c.deps, c.req(t), { id: "x", name: "Sala", capacity: null })).response,
    ],
    ["deleteSpace", async (c, t) => (await deleteSpace(c.deps, c.req(t), { id: "x" })).response],
  ];

  for (const [name, call] of calls) {
    test(`${name}: sem sessão responde 401`, async () => {
      expect(await call(ctx, null)).toMatchObject({ ok: false, status: 401 });
      expect(await call(ctx, "token-que-nao-existe")).toMatchObject({ ok: false, status: 401 });
    });

    test(`${name}: horários e docente recebem 403 e nada é alterado`, async () => {
      expect(await call(ctx, ctx.horarios.token)).toMatchObject({ ok: false, status: 403 });
      expect(await call(ctx, ctx.docente.token)).toMatchObject({ ok: false, status: 403 });
      expect((await ctx.deps.users.list()).length).toBe(3);
      expect((await ctx.deps.spaces.list()).length).toBe(0);
      expect((await ctx.deps.users.list()).find((u) => u.id === ctx.docente.id)?.active).toBe(true);
    });
  }

  test("conta desativada perde o acesso administrativo", async () => {
    await ctx.deps.users.update(ctx.horarios.id, {
      name: "H",
      code: "HOR",
      roles: ["admin"],
    });
    expect((await listAccounts(ctx.deps, ctx.req(ctx.horarios.token))).response.ok).toBe(true);
    await ctx.deps.users.setActive(ctx.horarios.id, false);
    expect((await listAccounts(ctx.deps, ctx.req(ctx.horarios.token))).response).toMatchObject({
      ok: false,
      status: 401,
    });
  });
});

describe("contas (administrador)", () => {
  let ctx: Ctx;
  beforeEach(async () => {
    ctx = await setup();
  });

  test("lista contas sem hash e devolve setCookie nulo com sessão recente", async () => {
    const out = await listAccounts(ctx.deps, ctx.req(ctx.admin.token));
    expect(out.setCookie).toContain("sid=");
    if (!out.response.ok) throw new Error("esperava ok");
    expect(out.response.data).toHaveLength(3);
    expect(JSON.stringify(out.response.data)).not.toContain("passwordHash");
  });

  test("cria conta; a nova conta consegue entrar", async () => {
    const out = await createAccount(ctx.deps, ctx.req(ctx.admin.token), NEW_ACCOUNT);
    expect(out.response).toMatchObject({
      ok: true,
      data: { email: "nova@ifsc.edu.br", code: "NOVA", roles: ["docente"], active: true },
    });
    expect((await ctx.auth.login("nova@ifsc.edu.br", NEW_PASSWORD)).ok).toBe(true);
  });

  test("validação e conflito viram 400 e 409 com o campo", async () => {
    const admin = ctx.req(ctx.admin.token);
    expect((await createAccount(ctx.deps, admin, { ...NEW_ACCOUNT, email: "x" })).response).toEqual(
      expect.objectContaining({ ok: false, status: 400, field: "email" }),
    );
    expect(
      (await createAccount(ctx.deps, admin, { ...NEW_ACCOUNT, email: "admin@ifsc.edu.br" }))
        .response,
    ).toMatchObject({ ok: false, status: 409, field: "email" });
    expect(
      (await createAccount(ctx.deps, admin, { ...NEW_ACCOUNT, password: "curta" })).response, // betterleaks:allow
    ).toMatchObject({ ok: false, status: 400, field: "password" });
  });

  test("corpo malformado vira 400", async () => {
    const admin = ctx.req(ctx.admin.token);
    for (const body of [
      null,
      "texto",
      [],
      {},
      { ...NEW_ACCOUNT, roles: "admin" },
      { ...NEW_ACCOUNT, roles: [1] },
    ]) {
      expect((await createAccount(ctx.deps, admin, body)).response).toMatchObject({
        ok: false,
        status: 400,
        message: "Requisição inválida.",
      });
    }
    expect((await updateAccount(ctx.deps, admin, { id: 1 })).response).toMatchObject({
      status: 400,
    });
    expect(
      (await setAccountActive(ctx.deps, admin, { id: "x", active: "sim" })).response,
    ).toMatchObject({
      status: 400,
    });
    expect((await resetAccountPassword(ctx.deps, admin, { id: "x" })).response).toMatchObject({
      status: 400,
    });
    expect(
      (await createSpace(ctx.deps, admin, { name: "A", capacity: {} })).response,
    ).toMatchObject({
      status: 400,
    });
    expect(
      (await updateSpace(ctx.deps, admin, { name: "A", capacity: null })).response,
    ).toMatchObject({
      status: 400,
    });
  });

  test("edita nome, sigla e papéis; conta inexistente é 404", async () => {
    const admin = ctx.req(ctx.admin.token);
    expect(
      (
        await updateAccount(ctx.deps, admin, {
          id: ctx.docente.id,
          name: "Docente Novo",
          code: "DN",
          roles: ["docente", "horarios"],
        })
      ).response,
    ).toMatchObject({
      ok: true,
      data: { name: "Docente Novo", code: "DN", roles: ["docente", "horarios"] },
    });
    expect(
      (
        await updateAccount(ctx.deps, admin, {
          id: "nao-existe",
          name: "X",
          code: "",
          roles: ["docente"],
        })
      ).response,
    ).toMatchObject({ ok: false, status: 404 });
  });

  test("desativar encerra a sessão da conta e impede novo login", async () => {
    const admin = ctx.req(ctx.admin.token);
    expect(await ctx.auth.authenticate(ctx.horarios.token)).not.toBeNull();
    const out = await setAccountActive(ctx.deps, admin, { id: ctx.horarios.id, active: false });
    expect(out.response).toMatchObject({ ok: true, data: { active: false } });
    expect(await ctx.auth.authenticate(ctx.horarios.token)).toBeNull();
    expect((await ctx.auth.login("horarios@ifsc.edu.br", USER_PASSWORD)).ok).toBe(false);
    // Reativar volta a permitir o login.
    await setAccountActive(ctx.deps, admin, { id: ctx.horarios.id, active: true });
    expect((await ctx.auth.login("horarios@ifsc.edu.br", USER_PASSWORD)).ok).toBe(true);
  });

  test("redefinir a senha encerra sessões; a senha antiga deixa de valer", async () => {
    const admin = ctx.req(ctx.admin.token);
    const out = await resetAccountPassword(ctx.deps, admin, {
      id: ctx.docente.id,
      password: NEW_PASSWORD,
    });
    expect(out.response).toEqual({ ok: true, data: null });
    expect(await ctx.auth.authenticate(ctx.docente.token)).toBeNull();
    expect((await ctx.auth.login("docente@ifsc.edu.br", USER_PASSWORD)).ok).toBe(false);
    expect((await ctx.auth.login("docente@ifsc.edu.br", NEW_PASSWORD)).ok).toBe(true);
  });

  test("o último administrador não pode se desativar nem perder o papel", async () => {
    const admin = ctx.req(ctx.admin.token);
    expect(
      (await setAccountActive(ctx.deps, admin, { id: ctx.admin.id, active: false })).response,
    ).toMatchObject({ ok: false, status: 409 });
    expect(
      (
        await updateAccount(ctx.deps, admin, {
          id: ctx.admin.id,
          name: "Admin",
          code: "ADM",
          roles: ["docente"],
        })
      ).response,
    ).toMatchObject({ ok: false, status: 409, field: "roles" });
    expect(await ctx.auth.authenticate(ctx.admin.token)).not.toBeNull();
  });
});

describe("contas fantasmas (administrador)", () => {
  let ctx: Ctx;
  const ghost = async (id: string) => {
    await ctx.db.insert(schema.users).values({
      id,
      email: `${id}@ifsc.edu.br`,
      name: "Zeca Quintal",
      code: null,
      roles: "docente",
      passwordHash: "descartada",
      active: true,
      placeholder: true,
      createdAt: "t",
      updatedAt: "t",
    });
  };
  beforeEach(async () => {
    ctx = await setup();
    await ghost("fantasma");
  });

  test("ativar com e-mail e senha válidos tira a marca e permite entrar", async () => {
    expect((await ctx.auth.login("fantasma@ifsc.edu.br", NEW_PASSWORD)).ok).toBe(false);
    const out = await activatePlaceholderAccount(ctx.deps, ctx.req(ctx.admin.token), {
      id: "fantasma",
      email: "Zeca.Real@IFSC.edu.br",
      password: NEW_PASSWORD,
    });
    expect(out.response).toMatchObject({
      ok: true,
      data: { id: "fantasma", email: "zeca.real@ifsc.edu.br", placeholder: false },
    });
    expect((await ctx.auth.login("zeca.real@ifsc.edu.br", NEW_PASSWORD)).ok).toBe(true);
  });

  test("ativar com e-mail de outra conta: 'Este e-mail já está em uso'", async () => {
    const out = await activatePlaceholderAccount(ctx.deps, ctx.req(ctx.admin.token), {
      id: "fantasma",
      email: "docente@ifsc.edu.br",
      password: NEW_PASSWORD,
    });
    expect(out.response).toMatchObject({
      ok: false,
      status: 409,
      field: "email",
      message: "Este e-mail já está em uso.",
    });
    expect((await ctx.deps.users.list()).find((u) => u.id === "fantasma")?.placeholder).toBe(true);
  });

  test("fundir move os vínculos para a conta escolhida e apaga a fantasma", async () => {
    await ctx.db
      .insert(schema.teacherMappings)
      .values({ sourceTeacherId: "P1", sourceShort: "ZQ", userId: "fantasma", updatedAt: "t" });
    const out = await mergePlaceholderAccount(ctx.deps, ctx.req(ctx.admin.token), {
      id: "fantasma",
      targetId: ctx.docente.id,
    });
    expect(out.response).toEqual({ ok: true, data: null });
    expect((await ctx.deps.users.list()).some((u) => u.id === "fantasma")).toBe(false);
    const [mapping] = await ctx.db.select().from(schema.teacherMappings);
    expect(mapping?.userId).toBe(ctx.docente.id);
  });

  test("fundir em outra fantasma ou em conta inativa é recusado", async () => {
    const admin = ctx.req(ctx.admin.token);
    await ghost("outra");
    await ctx.deps.users.setActive(ctx.horarios.id, false);
    for (const targetId of ["outra", ctx.horarios.id]) {
      const out = await mergePlaceholderAccount(ctx.deps, admin, { id: "fantasma", targetId });
      expect(out.response).toMatchObject({ ok: false, status: 400, field: "targetId" });
    }
    expect((await ctx.deps.users.list()).some((u) => u.id === "fantasma")).toBe(true);
  });

  test("corpo malformado vira 400", async () => {
    const admin = ctx.req(ctx.admin.token);
    for (const body of [null, {}, { id: "fantasma", email: "a@ifsc.edu.br" }]) {
      expect((await activatePlaceholderAccount(ctx.deps, admin, body)).response).toMatchObject({
        ok: false,
        status: 400,
        message: "Requisição inválida.",
      });
    }
    for (const body of [null, {}, { id: "fantasma", targetId: 3 }]) {
      expect((await mergePlaceholderAccount(ctx.deps, admin, body)).response).toMatchObject({
        ok: false,
        status: 400,
        message: "Requisição inválida.",
      });
    }
  });
});

describe("espaços (administrador)", () => {
  test("cria, lista e edita; valida e recusa duplicados", async () => {
    const ctx = await setup();
    const admin = ctx.req(ctx.admin.token);
    const created = await createSpace(ctx.deps, admin, { name: " Lab 1 ", capacity: "30" });
    if (!created.response.ok) throw new Error("esperava ok");
    expect(created.response.data).toMatchObject({ name: "Lab 1", capacity: 30 });
    expect(
      (await createSpace(ctx.deps, admin, { name: "lab 1", capacity: null })).response,
    ).toMatchObject({ ok: false, status: 409, field: "name" });
    expect(
      (await createSpace(ctx.deps, admin, { name: "Sala", capacity: 5000 })).response,
    ).toMatchObject({ ok: false, status: 400, field: "capacity" });
    const edited = await updateSpace(ctx.deps, admin, {
      id: created.response.data.id,
      name: "Laboratório 1",
      capacity: null,
    });
    expect(edited.response).toMatchObject({ ok: true, data: { capacity: null } });
    const listed = await listAdminSpaces(ctx.deps, admin);
    expect(listed.response).toMatchObject({ ok: true, data: [{ name: "Laboratório 1" }] });
    expect(
      (await updateSpace(ctx.deps, admin, { id: "nao-existe", name: "Y", capacity: null }))
        .response,
    ).toMatchObject({ ok: false, status: 404 });
  });

  test("grava, edita e lista equipamentos e observações", async () => {
    const ctx = await setup();
    const admin = ctx.req(ctx.admin.token);
    const created = await createSpace(ctx.deps, admin, {
      name: "Lab 2",
      capacity: null,
      equipment: { projetor: 1, computadores: " 20 ", som: null },
      notes: " Lousa digital ",
    });
    if (!created.response.ok) throw new Error("esperava ok");
    expect(created.response.data.equipment).toEqual({
      items: { projetor: 1, computadores: 20 },
      notes: "Lousa digital",
    });
    const id = created.response.data.id;
    expect(
      (await updateSpace(ctx.deps, admin, { id, name: "Lab 2", capacity: 10, notes: null }))
        .response,
    ).toMatchObject({ ok: true, data: { equipment: { items: {}, notes: null } } });
    expect(
      (
        await updateSpace(ctx.deps, admin, {
          id,
          name: "Lab 2",
          capacity: 10,
          equipment: { som: 0 },
          notes: "Caixa",
        })
      ).response,
    ).toMatchObject({ ok: true });
    await createSpace(ctx.deps, admin, { name: "Sala 1", capacity: null });
    expect((await listAdminSpaces(ctx.deps, admin)).response).toEqual({
      ok: true,
      data: [
        { id, name: "Lab 2", capacity: 10, equipment: { items: { som: 0 }, notes: "Caixa" } },
        {
          id: expect.any(String),
          name: "Sala 1",
          capacity: null,
          equipment: { items: {}, notes: null },
        },
      ],
    });
    expect(
      (
        await updateSpace(ctx.deps, admin, {
          id,
          name: "Lab 2",
          capacity: 10,
          equipment: { computadores: "1000" },
        })
      ).response,
    ).toMatchObject({ ok: false, status: 400, field: "computadores" });
    expect(
      (await createSpace(ctx.deps, admin, { name: "X", capacity: null, equipment: { tv: 1 } }))
        .response,
    ).toEqual({ ok: false, status: 400, message: "Tipo de equipamento desconhecido." });
  });

  test("formato inválido de equipamentos, observações ou exclusão é 400 sem gravar", async () => {
    const ctx = await setup();
    const admin = ctx.req(ctx.admin.token);
    const bodies: unknown[] = [
      { name: "A", capacity: null, equipment: "projetor" },
      { name: "A", capacity: null, equipment: [1] },
      { name: "A", capacity: null, equipment: null },
      { name: "A", capacity: null, equipment: { projetor: true } },
      { name: "A", capacity: null, equipment: { projetor: {} } },
      { name: "A", capacity: null, notes: 5 },
      { name: "A", capacity: null, equipment: {}, notes: ["x"] },
    ];
    for (const body of bodies) {
      expect((await createSpace(ctx.deps, admin, body)).response).toEqual({
        ok: false,
        status: 400,
        message: "Requisição inválida.",
      });
      expect(
        (await updateSpace(ctx.deps, admin, { ...(body as object), id: "x" })).response,
      ).toMatchObject({ status: 400, message: "Requisição inválida." });
    }
    expect((await ctx.deps.spaces.list()).length).toBe(0);
    for (const body of [{}, { id: 1 }, null, "x"]) {
      expect((await deleteSpace(ctx.deps, admin, body)).response).toEqual({
        ok: false,
        status: 400,
        message: "Requisição inválida.",
      });
    }
  });

  test("exclui espaço sem uso; em uso é 409; inexistente é 404", async () => {
    const ctx = await setup();
    const admin = ctx.req(ctx.admin.token);
    const free = await createSpace(ctx.deps, admin, {
      name: "Livre",
      capacity: null,
      equipment: { projetor: 1 },
      notes: null,
    });
    const used = await createSpace(ctx.deps, admin, { name: "Usado", capacity: null });
    if (!free.response.ok || !used.response.ok) throw new Error("esperava ok");
    await ctx.db.insert(schema.roomMappings).values({
      sourceRoomId: "r1",
      sourceShort: "USADO",
      spaceId: used.response.data.id,
      updatedAt: "t",
    });
    expect((await deleteSpace(ctx.deps, admin, { id: free.response.data.id })).response).toEqual({
      ok: true,
      data: null,
    });
    expect((await deleteSpace(ctx.deps, admin, { id: used.response.data.id })).response).toEqual({
      ok: false,
      status: 409,
      message: "Este espaço tem reservas, aulas ou vínculo com o XML e não pode ser excluído.",
    });
    expect((await deleteSpace(ctx.deps, admin, { id: free.response.data.id })).response).toEqual({
      ok: false,
      status: 404,
      message: "Espaço não encontrado.",
    });
    expect((await ctx.deps.spaces.list()).map((space) => space.name)).toEqual(["Usado"]);
  });
});

const SEMESTER = {
  name: "2026.2",
  start: "2026-08-03",
  end: "2026-12-19",
  terms: [{ position: 1, start: "2026-08-03", end: "2026-10-03" }],
  blocks: [{ number: 1, name: "Noite 12", short: "N12", start: "18:00", end: "19:50" }],
};

describe("semestres: matriz de autorização", () => {
  let ctx: Ctx;
  beforeEach(async () => {
    ctx = await setup();
  });

  const calls: Array<[string, (c: Ctx, token: string | null) => Promise<unknown>]> = [
    ["listSemesters", async (c, t) => (await listSemesters(c.deps, c.req(t))).response],
    ["getSemester", async (c, t) => (await getSemester(c.deps, c.req(t), { id: "x" })).response],
    ["createSemester", async (c, t) => (await createSemester(c.deps, c.req(t), SEMESTER)).response],
    [
      "updateSemester",
      async (c, t) => (await updateSemester(c.deps, c.req(t), { ...SEMESTER, id: "x" })).response,
    ],
  ];

  for (const [name, call] of calls) {
    test(`${name}: sem sessão responde 401`, async () => {
      expect(await call(ctx, null)).toMatchObject({ ok: false, status: 401 });
      expect(await call(ctx, "token-que-nao-existe")).toMatchObject({ ok: false, status: 401 });
    });

    test(`${name}: docente recebe 403 e nada é gravado`, async () => {
      expect(await call(ctx, ctx.docente.token)).toMatchObject({ ok: false, status: 403 });
      expect(await ctx.deps.semesters.list()).toHaveLength(0);
    });

    test(`${name}: administrador e horários passam da autorização`, async () => {
      for (const token of [ctx.admin.token, ctx.horarios.token]) {
        const response = (await call(ctx, token)) as { ok: boolean; status?: number };
        expect([401, 403]).not.toContain(response.status);
      }
    });
  }
});

describe("semestres (administrador e horários)", () => {
  test("horários cria, lê, lista e edita; admin também", async () => {
    const ctx = await setup();
    const horarios = ctx.req(ctx.horarios.token);
    const created = await createSemester(ctx.deps, horarios, SEMESTER);
    if (!created.response.ok) throw new Error("esperava ok");
    const id = created.response.data.id;
    expect(created.response.data).toMatchObject({ name: "2026.2", terms: [{ position: 1 }] });
    expect((await getSemester(ctx.deps, horarios, { id })).response).toMatchObject({
      ok: true,
      data: { id, blocks: [{ number: 1, short: "N12" }] },
    });
    expect((await listSemesters(ctx.deps, ctx.req(ctx.admin.token))).response).toMatchObject({
      ok: true,
      data: [{ id }],
    });
    const edited = await updateSemester(ctx.deps, ctx.req(ctx.admin.token), {
      ...SEMESTER,
      id,
      name: "2026.2 revisado",
      blocks: [{ number: "2", name: "Noite 34", short: "N34", start: "20:10", end: "22:00" }],
    });
    expect(edited.response).toMatchObject({
      ok: true,
      data: { name: "2026.2 revisado", blocks: [{ number: 2 }] },
    });
  });

  test("validação e conflito viram 400 e 409 com o campo; inexistente é 404", async () => {
    const ctx = await setup();
    const horarios = ctx.req(ctx.horarios.token);
    await createSemester(ctx.deps, horarios, SEMESTER);
    expect(
      (await createSemester(ctx.deps, horarios, { ...SEMESTER, name: "2026.2".toLowerCase() }))
        .response,
    ).toMatchObject({ ok: false, status: 409, field: "name" });
    expect(
      (await createSemester(ctx.deps, horarios, { ...SEMESTER, name: "B", start: "2026-02-30" }))
        .response,
    ).toMatchObject({ ok: false, status: 400, field: "start" });
    expect(
      (await updateSemester(ctx.deps, horarios, { ...SEMESTER, id: "nao-existe", name: "Z" }))
        .response,
    ).toMatchObject({ ok: false, status: 404 });
    expect((await getSemester(ctx.deps, horarios, { id: "nao-existe" })).response).toMatchObject({
      ok: false,
      status: 404,
    });
  });

  test("corpo malformado vira 400", async () => {
    const ctx = await setup();
    const horarios = ctx.req(ctx.horarios.token);
    const bad: unknown[] = [
      null,
      "texto",
      [],
      { ...SEMESTER, name: 1 },
      { ...SEMESTER, start: null },
      { ...SEMESTER, end: 2 },
      { ...SEMESTER, terms: "x" },
      { ...SEMESTER, terms: [null] },
      { ...SEMESTER, terms: [{ position: "1", start: "a", end: "b" }] },
      { ...SEMESTER, terms: [{ position: 1, start: 1, end: "b" }] },
      { ...SEMESTER, blocks: {} },
      { ...SEMESTER, blocks: [null] },
      {
        ...SEMESTER,
        blocks: [{ number: {}, name: "a", short: "a", start: "08:00", end: "09:00" }],
      },
      { ...SEMESTER, blocks: [{ number: 1, name: 2, short: "a", start: "08:00", end: "09:00" }] },
      { ...SEMESTER, blocks: [{ number: 1, name: "a", short: "a", start: "08:00" }] },
    ];
    for (const body of bad) {
      expect((await createSemester(ctx.deps, horarios, body)).response).toMatchObject({
        ok: false,
        status: 400,
        message: "Requisição inválida.",
      });
    }
    expect(
      (await updateSemester(ctx.deps, horarios, { ...SEMESTER, id: 5 })).response,
    ).toMatchObject({ ok: false, status: 400 });
    expect((await getSemester(ctx.deps, horarios, { id: 5 })).response).toMatchObject({
      ok: false,
      status: 400,
    });
    expect((await getSemester(ctx.deps, horarios, null)).response).toMatchObject({
      ok: false,
      status: 400,
    });
    expect(await ctx.deps.semesters.list()).toHaveLength(0);
  });
});

describe("semestres: nome vazio", () => {
  test("vira erro de campo (400 com field=name), igual ao do serviço", async () => {
    const ctx = await setup();
    expect(
      (await createSemester(ctx.deps, ctx.req(ctx.horarios.token), { ...SEMESTER, name: "  " }))
        .response,
    ).toMatchObject({ ok: false, status: 400, field: "name" });
    expect(
      (await createSemester(ctx.deps, ctx.req(ctx.horarios.token), { ...SEMESTER, name: "" }))
        .response,
    ).toMatchObject({ ok: false, status: 400, field: "name" });
  });
});
