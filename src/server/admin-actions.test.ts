import { Database } from "bun:sqlite";
import { beforeEach, describe, expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { createAuthService } from "#/application/auth";
import { createSpacesService } from "#/application/spaces";
import { createUsersService } from "#/application/users";
import type { Role } from "#/domain/user";
import { createPasswordHasher } from "#/infra/auth/password-hasher";
import { createLoginAttemptRepository } from "#/infra/db/repos/login-attempt-repository";
import { createSessionRepository } from "#/infra/db/repos/session-repository";
import { createSpaceRepository } from "#/infra/db/repos/space-repository";
import { createUserRepository } from "#/infra/db/repos/user-repository";
import * as schema from "#/infra/db/schema";
import { cryptoRandom, systemClock } from "#/infra/runtime";
import {
  type AdminDeps,
  createAccount,
  createSpace,
  listAccounts,
  listAdminSpaces,
  resetAccountPassword,
  setAccountActive,
  updateAccount,
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
});
