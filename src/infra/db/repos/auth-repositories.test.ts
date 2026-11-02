import { Database } from "bun:sqlite";
import { beforeEach, describe, expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import type {
  LoginAttemptRepository,
  Session,
  SessionRepository,
  UserRepository,
} from "#/application/ports";
import { createLoginAttemptRepository } from "#/infra/db/repos/login-attempt-repository";
import { createSessionRepository } from "#/infra/db/repos/session-repository";
import { createUserRepository } from "#/infra/db/repos/user-repository";
import * as schema from "#/infra/db/schema";

function openDb() {
  const sqlite = new Database(":memory:");
  sqlite.run("PRAGMA foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "drizzle" });
  return { db, sqlite };
}

describe("UserRepository", () => {
  let repo: UserRepository;
  let sqlite: Database;

  beforeEach(() => {
    const opened = openDb();
    sqlite = opened.sqlite;
    repo = createUserRepository(opened.db);
  });

  test("cria com email normalizado, ativo, e encontra por email e id", async () => {
    const created = await repo.create({
      email: "  Ana@IFSC.edu.br ",
      name: "Ana",
      code: "ANA",
      roles: ["admin", "docente"],
      passwordHash: "hash-1",
    });
    expect(created).toEqual({
      id: created.id,
      email: "ana@ifsc.edu.br",
      name: "Ana",
      code: "ANA",
      roles: ["admin", "docente"],
      active: true,
    });
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
    const byEmail = await repo.findByEmail("ana@ifsc.edu.br");
    expect(byEmail?.passwordHash).toBe("hash-1");
    expect(byEmail?.id).toBe(created.id);
    const byId = await repo.findById(created.id);
    expect(byId).toEqual(created);
    expect(byId).not.toHaveProperty("passwordHash");
  });

  test("não encontra quando não existe", async () => {
    expect(await repo.findByEmail("x@y.br")).toBeNull();
    expect(await repo.findById("nao-existe")).toBeNull();
  });

  test("email duplicado e sigla duplicada são rejeitados; sigla nula repete", async () => {
    const base = { name: "N", roles: [], passwordHash: "h" } as const;
    await repo.create({ ...base, email: "a@x.br", code: "AA", roles: ["docente"] });
    await expect(
      repo.create({ ...base, email: "A@x.br", code: null, roles: ["docente"] }),
    ).rejects.toThrow();
    await expect(
      repo.create({ ...base, email: "b@x.br", code: "AA", roles: ["docente"] }),
    ).rejects.toThrow();
    await repo.create({ ...base, email: "c@x.br", code: null, roles: ["docente"] });
    await repo.create({ ...base, email: "d@x.br", code: null, roles: ["docente"] });
  });

  test("papéis desconhecidos no banco são descartados na leitura", async () => {
    const user = await repo.create({
      email: "a@x.br",
      name: "A",
      code: null,
      roles: ["horarios"],
      passwordHash: "h",
    });
    sqlite.run("UPDATE users SET roles = 'superuser,admin,horarios' WHERE id = ?", [user.id]);
    expect((await repo.findById(user.id))?.roles).toEqual(["admin", "horarios"]);
  });

  test("atualiza o hash da senha", async () => {
    const user = await repo.create({
      email: "a@x.br",
      name: "A",
      code: null,
      roles: [],
      passwordHash: "antigo",
    });
    await repo.updatePasswordHash(user.id, "novo");
    expect((await repo.findByEmail("a@x.br"))?.passwordHash).toBe("novo");
  });

  test("lista contas ordenadas por nome, sem hash", async () => {
    const base = { code: null, roles: ["docente"], passwordHash: "h" } as const;
    await repo.create({ ...base, email: "b@x.br", name: "Bia", roles: ["docente"] });
    await repo.create({ ...base, email: "a@x.br", name: "Ana", roles: ["admin"] });
    const all = await repo.list();
    expect(all.map((u) => u.name)).toEqual(["Ana", "Bia"]);
    expect(all[0]).not.toHaveProperty("passwordHash");
    expect(all[0]?.roles).toEqual(["admin"]);
  });

  test("busca por sigla exata", async () => {
    const created = await repo.create({
      email: "a@x.br",
      name: "A",
      code: "ANA",
      roles: ["docente"],
      passwordHash: "h",
    });
    expect(await repo.findByCode("ANA")).toEqual(created);
    expect(await repo.findByCode("ana")).toBeNull();
  });

  test("atualiza nome, sigla e papéis; retorna nulo se não existe; sigla duplicada falha", async () => {
    const a = await repo.create({
      email: "a@x.br",
      name: "A",
      code: "AA",
      roles: ["docente"],
      passwordHash: "h",
    });
    await repo.create({
      email: "b@x.br",
      name: "B",
      code: "BB",
      roles: ["docente"],
      passwordHash: "h",
    });
    const updated = await repo.update(a.id, {
      name: "Novo",
      code: null,
      roles: ["admin", "horarios"],
    });
    expect(updated).toEqual({
      ...a,
      name: "Novo",
      code: null,
      roles: ["admin", "horarios"],
    });
    expect(await repo.findById(a.id)).toEqual(updated);
    expect(await repo.update("nao-existe", { name: "X", code: null, roles: [] })).toBeNull();
    await expect(repo.update(a.id, { name: "N", code: "BB", roles: ["admin"] })).rejects.toThrow();
  });

  test("ativa e desativa sem tocar na senha", async () => {
    const user = await repo.create({
      email: "a@x.br",
      name: "A",
      code: null,
      roles: [],
      passwordHash: "h",
    });
    expect(await repo.setActive(user.id, false)).toBe(true);
    expect((await repo.findById(user.id))?.active).toBe(false);
    await repo.setActive(user.id, true);
    expect((await repo.findById(user.id))?.active).toBe(true);
    expect((await repo.findByEmail("a@x.br"))?.passwordHash).toBe("h");
  });

  describe("proteção atômica do último administrador", () => {
    const base = { code: null, passwordHash: "h" } as const;

    test("desativar o único admin ativo é recusado e nada muda", async () => {
      const admin = await repo.create({ ...base, email: "a@x.br", name: "A", roles: ["admin"] });
      expect(await repo.setActive(admin.id, false)).toBe(false);
      expect((await repo.findById(admin.id))?.active).toBe(true);
    });

    test("com outro admin ativo, desativar é aplicado", async () => {
      const a = await repo.create({ ...base, email: "a@x.br", name: "A", roles: ["admin"] });
      await repo.create({ ...base, email: "b@x.br", name: "B", roles: ["docente", "admin"] });
      expect(await repo.setActive(a.id, false)).toBe(true);
      expect((await repo.findById(a.id))?.active).toBe(false);
    });

    test("outro admin inativo não conta", async () => {
      const a = await repo.create({ ...base, email: "a@x.br", name: "A", roles: ["admin"] });
      const b = await repo.create({ ...base, email: "b@x.br", name: "B", roles: ["admin"] });
      sqlite.run("UPDATE users SET active = 0 WHERE id = ?", [b.id]);
      expect(await repo.setActive(a.id, false)).toBe(false);
    });

    test("papel parecido com admin não conta como admin", async () => {
      const a = await repo.create({ ...base, email: "a@x.br", name: "A", roles: ["admin"] });
      const b = await repo.create({ ...base, email: "b@x.br", name: "B", roles: ["docente"] });
      sqlite.run("UPDATE users SET roles = 'superadmin,docente' WHERE id = ?", [b.id]);
      expect(await repo.setActive(a.id, false)).toBe(false);
    });

    test("desativar quem não é admin e reativar sempre funcionam", async () => {
      await repo.create({ ...base, email: "a@x.br", name: "A", roles: ["admin"] });
      const d = await repo.create({ ...base, email: "d@x.br", name: "D", roles: ["docente"] });
      expect(await repo.setActive(d.id, false)).toBe(true);
      expect(await repo.setActive(d.id, true)).toBe(true);
      expect(await repo.setActive("nao-existe", false)).toBe(false);
    });

    test("tirar o papel admin do único admin é recusado; mantê-lo é permitido", async () => {
      const a = await repo.create({ ...base, email: "a@x.br", name: "A", roles: ["admin"] });
      expect(await repo.update(a.id, { name: "A", code: null, roles: ["docente"] })).toBeNull();
      expect((await repo.findById(a.id))?.roles).toEqual(["admin"]);
      const kept = await repo.update(a.id, {
        name: "Novo",
        code: null,
        roles: ["admin", "docente"],
      });
      expect(kept?.name).toBe("Novo");
    });

    test("com outro admin ativo, tirar o papel admin é aplicado", async () => {
      const a = await repo.create({ ...base, email: "a@x.br", name: "A", roles: ["admin"] });
      await repo.create({ ...base, email: "b@x.br", name: "B", roles: ["admin"] });
      const updated = await repo.update(a.id, { name: "A", code: null, roles: ["docente"] });
      expect(updated?.roles).toEqual(["docente"]);
    });
  });

  test("lê o flag active", async () => {
    const user = await repo.create({
      email: "a@x.br",
      name: "A",
      code: null,
      roles: [],
      passwordHash: "h",
    });
    sqlite.run("UPDATE users SET active = 0 WHERE id = ?", [user.id]);
    expect((await repo.findById(user.id))?.active).toBe(false);
  });
});

describe("SessionRepository", () => {
  let repo: SessionRepository;
  let userId: string;
  let otherUserId: string;

  const session = (overrides: Partial<Session> = {}): Session => ({
    id: "s1",
    userId,
    tokenHash: "hash-do-token",
    createdAt: "2026-11-02T12:00:00.000Z",
    expiresAt: "2026-11-09T12:00:00.000Z",
    lastSeenAt: "2026-11-02T12:00:00.000Z",
    ...overrides,
  });

  beforeEach(async () => {
    const { db } = openDb();
    const user = await createUserRepository(db).create({
      email: "a@x.br",
      name: "A",
      code: null,
      roles: [],
      passwordHash: "h",
    });
    userId = user.id;
    otherUserId = (
      await createUserRepository(db).create({
        email: "b@x.br",
        name: "B",
        code: null,
        roles: [],
        passwordHash: "h",
      })
    ).id;
    repo = createSessionRepository(db);
  });

  test("cria e encontra por hash do token", async () => {
    await repo.create(session());
    expect(await repo.findByTokenHash("hash-do-token")).toEqual(session());
    expect(await repo.findByTokenHash("outro")).toBeNull();
  });

  test("estende validade e último acesso", async () => {
    await repo.create(session());
    await repo.extend("s1", {
      lastSeenAt: "2026-11-08T12:00:00.000Z",
      expiresAt: "2026-11-15T12:00:00.000Z",
    });
    const found = await repo.findByTokenHash("hash-do-token");
    expect(found?.expiresAt).toBe("2026-11-15T12:00:00.000Z");
    expect(found?.lastSeenAt).toBe("2026-11-08T12:00:00.000Z");
    expect(found?.createdAt).toBe("2026-11-02T12:00:00.000Z");
  });

  test("remove por hash do token", async () => {
    await repo.create(session());
    await repo.deleteByTokenHash("hash-do-token");
    expect(await repo.findByTokenHash("hash-do-token")).toBeNull();
  });

  test("revoga todas as sessões do usuário e preserva as de outros", async () => {
    await repo.create(session({ id: "s1", tokenHash: "t1" }));
    await repo.create(session({ id: "s2", tokenHash: "t2" }));
    await repo.create(session({ id: "s3", tokenHash: "t3", userId: otherUserId }));
    await repo.revokeAllForUser(userId);
    expect(await repo.findByTokenHash("t1")).toBeNull();
    expect(await repo.findByTokenHash("t2")).toBeNull();
    expect(await repo.findByTokenHash("t3")).not.toBeNull();
  });

  test("hash do token é único e usuário precisa existir", async () => {
    await repo.create(session());
    await expect(repo.create(session({ id: "s2" }))).rejects.toThrow();
    await expect(
      repo.create(session({ id: "s3", tokenHash: "x", userId: "inexistente" })),
    ).rejects.toThrow();
  });
});

describe("LoginAttemptRepository", () => {
  let repo: LoginAttemptRepository;

  beforeEach(() => {
    repo = createLoginAttemptRepository(openDb().db);
  });

  test("conta só falhas do email dentro da janela", async () => {
    await repo.record({ email: "a@x.br", attemptedAt: "2026-11-02T11:00:00.000Z", success: false });
    await repo.record({ email: "a@x.br", attemptedAt: "2026-11-02T11:50:00.000Z", success: false });
    await repo.record({ email: "a@x.br", attemptedAt: "2026-11-02T11:55:00.000Z", success: true });
    await repo.record({ email: "b@x.br", attemptedAt: "2026-11-02T11:50:00.000Z", success: false });
    expect(await repo.countFailuresSince("a@x.br", "2026-11-02T11:45:00.000Z")).toBe(1);
    expect(await repo.countFailuresSince("a@x.br", "2026-11-02T10:00:00.000Z")).toBe(2);
    expect(await repo.countFailuresSince("c@x.br", "2026-11-02T10:00:00.000Z")).toBe(0);
  });

  test("purgeOlderThan apaga tentativas antigas (sucesso ou falha) e mantém as recentes", async () => {
    await repo.record({ email: "a@x.br", attemptedAt: "2026-11-01T10:00:00.000Z", success: false });
    await repo.record({ email: "a@x.br", attemptedAt: "2026-11-01T10:00:00.000Z", success: true });
    await repo.record({ email: "a@x.br", attemptedAt: "2026-11-02T11:00:00.000Z", success: false });
    await repo.purgeOlderThan("2026-11-02T00:00:00.000Z");
    expect(await repo.countFailuresSince("a@x.br", "2026-01-01T00:00:00.000Z")).toBe(1);
  });

  test("limpa falhas do email sem afetar outros", async () => {
    await repo.record({ email: "a@x.br", attemptedAt: "2026-11-02T11:50:00.000Z", success: false });
    await repo.record({ email: "b@x.br", attemptedAt: "2026-11-02T11:50:00.000Z", success: false });
    await repo.clearFailures("a@x.br");
    expect(await repo.countFailuresSince("a@x.br", "2026-11-02T00:00:00.000Z")).toBe(0);
    expect(await repo.countFailuresSince("b@x.br", "2026-11-02T00:00:00.000Z")).toBe(1);
  });
});

describe("schema de autenticação", () => {
  test("sessions referencia users com cascade e login_attempts tem índice por email", () => {
    const [fk] = getTableConfig(schema.sessions).foreignKeys;
    expect(fk?.reference().foreignTable).toBe(schema.users);
    expect(fk?.onDelete).toBe("cascade");
    expect(getTableConfig(schema.loginAttempts).indexes.map((i) => i.config.name)).toEqual([
      "login_attempts_email_idx",
    ]);
  });

  test("apagar o usuário apaga suas sessões", async () => {
    const { db, sqlite } = openDb();
    const user = await createUserRepository(db).create({
      email: "a@x.br",
      name: "A",
      code: null,
      roles: [],
      passwordHash: "h",
    });
    const sessionRepo = createSessionRepository(db);
    await sessionRepo.create({
      id: "s1",
      userId: user.id,
      tokenHash: "t",
      createdAt: "2026-11-02T12:00:00.000Z",
      expiresAt: "2026-11-09T12:00:00.000Z",
      lastSeenAt: "2026-11-02T12:00:00.000Z",
    });
    sqlite.run("DELETE FROM users WHERE id = ?", [user.id]);
    expect(await sessionRepo.findByTokenHash("t")).toBeNull();
  });
});
