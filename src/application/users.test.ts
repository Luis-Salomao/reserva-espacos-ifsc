import { beforeEach, describe, expect, test } from "bun:test";
import type {
  PasswordHasher,
  SessionRepository,
  UserRecord,
  UserRepository,
} from "#/application/ports";
import { createUsersService } from "#/application/users";
import { normalizeEmail, type Role, type User } from "#/domain/user";

const PASSWORD = "senha-falsa-teste-1"; // betterleaks:allow
const OTHER_PASSWORD = "outra-senha-falsa-2"; // betterleaks:allow

function setup() {
  const records = new Map<string, UserRecord>();
  let counter = 0;
  const strip = ({ passwordHash: _hash, ...user }: UserRecord): User => user;
  const revoked: string[] = [];
  const merged: Array<[string, string]> = [];
  let failNextCreate = false;
  let failNextUpdate = false;
  const isActiveAdmin = (r: UserRecord) => r.active && r.roles.includes("admin");
  const onlyActiveAdmin = (target: UserRecord) =>
    isActiveAdmin(target) &&
    ![...records.values()].some((r) => r.id !== target.id && isActiveAdmin(r));

  const users: UserRepository = {
    findByEmail: async (email) => [...records.values()].find((u) => u.email === email) ?? null,
    findById: async (id) => {
      const found = records.get(id);
      return found ? strip(found) : null;
    },
    findByCode: async (code) => {
      const found = [...records.values()].find((u) => u.code === code);
      return found ? strip(found) : null;
    },
    list: async () => [...records.values()].map(strip),
    create: async (input) => {
      if (failNextCreate) {
        failNextCreate = false;
        throw new Error("falha simulada");
      }
      counter += 1;
      const record: UserRecord = {
        id: `u${counter}`,
        email: normalizeEmail(input.email),
        name: input.name,
        code: input.code,
        roles: input.roles,
        active: true,
        placeholder: false,
        passwordHash: input.passwordHash,
      };
      records.set(record.id, record);
      return strip(record);
    },
    update: async (id, input) => {
      const found = records.get(id);
      if (!found) return null;
      if (failNextUpdate) {
        failNextUpdate = false;
        // Simula a corrida: outra conta passa a ter a sigla antes da gravação falhar.
        if (input.code !== null) {
          const rival = [...records.values()].find((r) => r.id !== id);
          if (rival) rival.code = input.code;
        }
        throw new Error("UNIQUE constraint failed");
      }
      if (!input.roles.includes("admin") && onlyActiveAdmin(found)) return null;
      Object.assign(found, input);
      return strip(found);
    },
    setActive: async (id, active) => {
      const found = records.get(id);
      if (!found) return false;
      if (!active && onlyActiveAdmin(found)) return false;
      found.active = active;
      return true;
    },
    updatePasswordHash: async (id, passwordHash) => {
      const found = records.get(id);
      if (found) found.passwordHash = passwordHash;
    },
    activatePlaceholder: async (id, email, passwordHash) => {
      const found = records.get(id);
      if (!found?.placeholder) return false;
      const normalized = normalizeEmail(email);
      if ([...records.values()].some((r) => r.id !== id && r.email === normalized)) {
        throw new Error("UNIQUE constraint failed: users.email");
      }
      Object.assign(found, { email: normalized, passwordHash, placeholder: false });
      return true;
    },
    mergeInto: async (fromId, toId) => {
      const from = records.get(fromId);
      const to = records.get(toId);
      if (!from?.placeholder || !to || to.placeholder || !to.active || fromId === toId) {
        return false;
      }
      records.delete(fromId);
      merged.push([fromId, toId]);
      return true;
    },
  };
  const sessions: SessionRepository = {
    create: async () => {},
    findByTokenHash: async () => null,
    extend: async () => {},
    deleteByTokenHash: async () => {},
    revokeAllForUser: async (userId) => {
      revoked.push(userId);
    },
  };
  const hasher: PasswordHasher = {
    hash: async (password) => `hash:${password}`,
    verify: async (password, stored) => stored === `hash:${password}`,
    needsRehash: () => false,
  };
  const service = createUsersService({ users, sessions, hasher });
  const valid = {
    email: "Ana@IFSC.edu.br",
    name: "Ana Souza",
    code: "ANA",
    roles: ["horarios"] as string[],
    password: PASSWORD,
  };
  return {
    service,
    records,
    revoked,
    merged,
    valid,
    failNextCreate: () => {
      failNextCreate = true;
    },
    failNextUpdate: () => {
      failNextUpdate = true;
    },
  };
}

describe("criar conta", () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  test("cria conta válida com email normalizado e hash da senha", async () => {
    const result = await ctx.service.create(ctx.valid);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("esperava ok");
    expect(result.value).toMatchObject({
      email: "ana@ifsc.edu.br",
      name: "Ana Souza",
      code: "ANA",
      roles: ["horarios"],
      active: true,
    });
    expect(ctx.records.get(result.value.id)?.passwordHash).toBe(`hash:${PASSWORD}`);
  });

  test("sigla vazia vira nula e papéis repetidos são deduplicados", async () => {
    const result = await ctx.service.create({
      ...ctx.valid,
      code: "  ",
      roles: ["docente", "docente", "admin"],
    });
    if (!result.ok) throw new Error("esperava ok");
    expect(result.value.code).toBeNull();
    expect(result.value.roles).toEqual(["docente", "admin"]);
  });

  test.each([
    ["email inválido", { email: "sem-arroba" }, "email"],
    ["nome vazio", { name: "   " }, "name"],
    ["nome longo demais", { name: "x".repeat(121) }, "name"],
    ["nome com controle", { name: "Ana\u0007" }, "name"],
    ["nome com DEL", { name: "Ana\u007f" }, "name"],
    ["nome com controle C1 (U+0085)", { name: "Ana\u0085" }, "name"],
    ["nome com controle C1 (U+009F)", { name: "\u009fAna" }, "name"],
    ["sigla inválida", { code: "A B" }, "code"],
    ["sigla longa", { code: "A".repeat(17) }, "code"],
    ["sem papéis", { roles: [] }, "roles"],
    ["papel desconhecido", { roles: ["root"] }, "roles"],
    ["senha curta", { password: "curta" }, "password"], // betterleaks:allow
    ["senha enorme", { password: "x".repeat(1025) }, "password"],
  ])("recusa %s", async (_label, override, field) => {
    const result = await ctx.service.create({ ...ctx.valid, ...override });
    expect(result).toMatchObject({ ok: false, kind: "validation", field });
    if (!result.ok) expect(result.message.length).toBeGreaterThan(5);
    expect(ctx.records.size).toBe(0);
  });

  test("aceita nome de 120 caracteres e sigla de 16", async () => {
    const result = await ctx.service.create({
      ...ctx.valid,
      name: "x".repeat(120),
      code: "A".repeat(16),
    });
    expect(result.ok).toBe(true);
  });

  test("email e sigla duplicados são conflito", async () => {
    await ctx.service.create(ctx.valid);
    expect(await ctx.service.create({ ...ctx.valid, code: "OUTRA" })).toMatchObject({
      ok: false,
      kind: "conflict",
      field: "email",
    });
    expect(await ctx.service.create({ ...ctx.valid, email: "b@ifsc.edu.br" })).toMatchObject({
      ok: false,
      kind: "conflict",
      field: "code",
    });
  });

  test("erro desconhecido na gravação é propagado", async () => {
    ctx.failNextCreate();
    await expect(ctx.service.create(ctx.valid)).rejects.toThrow("falha simulada");
  });
});

describe("corrida na criação", () => {
  test("falha na gravação com email/sigla já presentes vira conflito", async () => {
    const records: UserRecord[] = [];
    let hide = true;
    const base = setup();
    const raced = createUsersService({
      users: {
        findByEmail: async (email) =>
          hide ? null : (records.find((r) => r.email === email) ?? null),
        findById: async () => null,
        findByCode: async (code) => {
          if (hide) return null;
          const found = records.find((r) => r.code === code);
          return found ? { ...found } : null;
        },
        list: async () => [],
        create: async (input) => {
          records.push({
            id: "x",
            email: input.email,
            name: input.name,
            code: input.code,
            roles: input.roles,
            active: true,
            placeholder: false,
            passwordHash: input.passwordHash,
          });
          hide = false;
          throw new Error("UNIQUE constraint failed");
        },
        update: async () => null,
        setActive: async () => true,
        activatePlaceholder: async () => false,
        mergeInto: async () => false,
        updatePasswordHash: async () => {},
      },
      sessions: {
        create: async () => {},
        findByTokenHash: async () => null,
        extend: async () => {},
        deleteByTokenHash: async () => {},
        revokeAllForUser: async () => {},
      },
      hasher: { hash: async (p) => p, verify: async () => true, needsRehash: () => false },
    });
    expect(await raced.create(base.valid)).toMatchObject({
      ok: false,
      kind: "conflict",
      field: "email",
    });
  });

  test("corrida só na sigla", async () => {
    let created = false;
    const raced = createUsersService({
      users: {
        findByEmail: async () => null,
        findById: async () => null,
        findByCode: async () =>
          created
            ? {
                id: "y",
                email: "z@x.br",
                name: "Z",
                code: "ANA",
                roles: [],
                active: true,
                placeholder: false,
              }
            : null,
        list: async () => [],
        create: async () => {
          created = true;
          throw new Error("UNIQUE constraint failed");
        },
        update: async () => null,
        setActive: async () => true,
        activatePlaceholder: async () => false,
        mergeInto: async () => false,
        updatePasswordHash: async () => {},
      },
      sessions: {
        create: async () => {},
        findByTokenHash: async () => null,
        extend: async () => {},
        deleteByTokenHash: async () => {},
        revokeAllForUser: async () => {},
      },
      hasher: { hash: async (p) => p, verify: async () => true, needsRehash: () => false },
    });
    expect(await raced.create(setup().valid)).toMatchObject({
      ok: false,
      kind: "conflict",
      field: "code",
    });
  });
});

describe("editar conta", () => {
  let ctx: ReturnType<typeof setup>;
  let adminId: string;
  let otherId: string;
  beforeEach(async () => {
    ctx = setup();
    const admin = await ctx.service.create({
      ...ctx.valid,
      email: "admin@ifsc.edu.br",
      code: "ADM",
      roles: ["admin"],
    });
    const other = await ctx.service.create(ctx.valid);
    if (!admin.ok || !other.ok) throw new Error("setup");
    adminId = admin.value.id;
    otherId = other.value.id;
  });

  test("altera nome, sigla e papéis", async () => {
    const result = await ctx.service.update(otherId, {
      name: "  Ana Maria ",
      code: "AM",
      roles: ["docente", "horarios"],
    });
    expect(result).toMatchObject({
      ok: true,
      value: { name: "Ana Maria", code: "AM", roles: ["docente", "horarios"] },
    });
  });

  test("mantém a própria sigla sem acusar conflito e aceita limpar a sigla", async () => {
    expect(
      (await ctx.service.update(otherId, { name: "A", code: "ANA", roles: ["docente"] })).ok,
    ).toBe(true);
    const cleared = await ctx.service.update(otherId, { name: "A", code: "", roles: ["docente"] });
    expect(cleared).toMatchObject({ ok: true, value: { code: null } });
  });

  test("sigla de outra conta é conflito", async () => {
    expect(
      await ctx.service.update(otherId, { name: "A", code: "ADM", roles: ["docente"] }),
    ).toMatchObject({ ok: false, kind: "conflict", field: "code" });
  });

  test("valida os campos", async () => {
    expect(
      await ctx.service.update(otherId, { name: "", code: "", roles: ["docente"] }),
    ).toMatchObject({ ok: false, kind: "validation", field: "name" });
    expect(
      await ctx.service.update(otherId, { name: "A", code: "!", roles: ["docente"] }),
    ).toMatchObject({ ok: false, kind: "validation", field: "code" });
    expect(await ctx.service.update(otherId, { name: "A", code: "", roles: [] })).toMatchObject({
      ok: false,
      kind: "validation",
      field: "roles",
    });
  });

  test("conta inexistente", async () => {
    expect(
      await ctx.service.update("nao-existe", { name: "A", code: "", roles: ["docente"] }),
    ).toMatchObject({ ok: false, kind: "not_found" });
  });

  test("não remove o papel admin do último administrador ativo", async () => {
    const result = await ctx.service.update(adminId, {
      name: "Admin",
      code: "ADM",
      roles: ["docente"],
    });
    expect(result).toMatchObject({ ok: false, kind: "last_admin" });
    expect(ctx.records.get(adminId)?.roles).toEqual(["admin"]);
  });

  test("permite remover o papel admin quando há outro administrador ativo", async () => {
    await ctx.service.update(otherId, { name: "Ana", code: "ANA", roles: ["admin"] });
    const result = await ctx.service.update(adminId, {
      name: "Admin",
      code: "ADM",
      roles: ["docente"],
    });
    expect(result.ok).toBe(true);
  });

  test("administrador inativo não conta como outro administrador", async () => {
    await ctx.service.update(otherId, { name: "Ana", code: "ANA", roles: ["admin"] });
    const record = ctx.records.get(otherId);
    if (record) record.active = false;
    const result = await ctx.service.update(adminId, {
      name: "Admin",
      code: "ADM",
      roles: ["docente"],
    });
    expect(result).toMatchObject({ ok: false, kind: "last_admin" });
  });

  test("corrida na sigla durante a gravação vira conflito; outro erro propaga", async () => {
    ctx.failNextUpdate();
    expect(
      await ctx.service.update(otherId, { name: "A", code: "RIVAL", roles: ["docente"] }),
    ).toMatchObject({ ok: false, kind: "conflict", field: "code" });
    ctx.failNextUpdate();
    await expect(
      ctx.service.update(otherId, { name: "A", code: "", roles: ["docente"] }),
    ).rejects.toThrow("UNIQUE");
  });

  test("repositório recusa de forma atômica mesmo que a leitura prévia veja outro admin", async () => {
    const stale = createUsersService({
      users: {
        findByEmail: async () => null,
        findByCode: async () => null,
        list: async () => [],
        create: async () => {
          throw new Error("x");
        },
        findById: async () => ({
          id: "a",
          email: "a@x.br",
          name: "A",
          code: null,
          roles: ["admin"],
          active: true,
          placeholder: false,
        }),
        update: async () => null,
        setActive: async () => false,
        activatePlaceholder: async () => false,
        mergeInto: async () => false,
        updatePasswordHash: async () => {},
      },
      sessions: {
        create: async () => {},
        findByTokenHash: async () => null,
        extend: async () => {},
        deleteByTokenHash: async () => {},
        revokeAllForUser: async () => {
          throw new Error("não deveria revogar");
        },
      },
      hasher: { hash: async (p) => p, verify: async () => true, needsRehash: () => false },
    });
    expect(await stale.setActive("a", false)).toMatchObject({ ok: false, kind: "last_admin" });
    expect(await stale.update("a", { name: "A", code: "", roles: ["docente"] })).toMatchObject({
      ok: false,
      kind: "last_admin",
      field: "roles",
    });
  });

  test("conta removida entre a leitura e a gravação vira não encontrada", async () => {
    let calls = 0;
    const vanishing = createUsersService({
      users: {
        findByEmail: async () => null,
        findByCode: async () => null,
        list: async () => [],
        create: async () => {
          throw new Error("x");
        },
        findById: async () => {
          calls += 1;
          return calls === 1
            ? {
                id: "a",
                email: "a@x.br",
                name: "A",
                code: null,
                roles: ["docente"],
                active: true,
                placeholder: false,
              }
            : null;
        },
        update: async () => null,
        setActive: async () => false,
        activatePlaceholder: async () => false,
        mergeInto: async () => false,
        updatePasswordHash: async () => {},
      },
      sessions: {
        create: async () => {},
        findByTokenHash: async () => null,
        extend: async () => {},
        deleteByTokenHash: async () => {},
        revokeAllForUser: async () => {},
      },
      hasher: { hash: async (p) => p, verify: async () => true, needsRehash: () => false },
    });
    expect(await vanishing.setActive("a", false)).toMatchObject({ ok: false, kind: "not_found" });
  });

  test("mantém o papel admin ao editar o último administrador", async () => {
    const result = await ctx.service.update(adminId, {
      name: "Novo nome",
      code: "ADM",
      roles: ["admin", "docente"],
    });
    expect(result.ok).toBe(true);
  });
});

describe("ativar e desativar", () => {
  let ctx: ReturnType<typeof setup>;
  let adminId: string;
  let otherId: string;
  beforeEach(async () => {
    ctx = setup();
    const admin = await ctx.service.create({
      ...ctx.valid,
      email: "admin@ifsc.edu.br",
      code: "ADM",
      roles: ["admin"],
    });
    const other = await ctx.service.create(ctx.valid);
    if (!admin.ok || !other.ok) throw new Error("setup");
    adminId = admin.value.id;
    otherId = other.value.id;
  });

  test("desativar revoga todas as sessões da conta", async () => {
    const result = await ctx.service.setActive(otherId, false);
    expect(result).toMatchObject({ ok: true, value: { active: false } });
    expect(ctx.records.get(otherId)?.active).toBe(false);
    expect(ctx.revoked).toEqual([otherId]);
  });

  test("reativar não revoga sessões", async () => {
    await ctx.service.setActive(otherId, false);
    ctx.revoked.length = 0;
    const result = await ctx.service.setActive(otherId, true);
    expect(result).toMatchObject({ ok: true, value: { active: true } });
    expect(ctx.revoked).toEqual([]);
  });

  test("o último administrador ativo não pode se desativar", async () => {
    const result = await ctx.service.setActive(adminId, false);
    expect(result).toMatchObject({ ok: false, kind: "last_admin" });
    expect(ctx.records.get(adminId)?.active).toBe(true);
    expect(ctx.revoked).toEqual([]);
  });

  test("com outro administrador ativo, desativar é permitido", async () => {
    await ctx.service.update(otherId, { name: "Ana", code: "ANA", roles: ["admin"] });
    expect((await ctx.service.setActive(adminId, false)).ok).toBe(true);
  });

  test("conta inexistente", async () => {
    expect(await ctx.service.setActive("nao-existe", false)).toMatchObject({
      ok: false,
      kind: "not_found",
    });
  });
});

describe("redefinir senha", () => {
  test("grava o novo hash e revoga as sessões", async () => {
    const ctx = setup();
    const created = await ctx.service.create(ctx.valid);
    if (!created.ok) throw new Error("setup");
    const result = await ctx.service.resetPassword(created.value.id, OTHER_PASSWORD);
    expect(result.ok).toBe(true);
    expect(ctx.records.get(created.value.id)?.passwordHash).toBe(`hash:${OTHER_PASSWORD}`);
    expect(ctx.revoked).toEqual([created.value.id]);
  });

  test("recusa senha curta/enorme sem tocar na conta", async () => {
    const ctx = setup();
    const created = await ctx.service.create(ctx.valid);
    if (!created.ok) throw new Error("setup");
    expect(await ctx.service.resetPassword(created.value.id, "curta")).toMatchObject({
      ok: false,
      kind: "validation",
      field: "password",
    });
    expect(ctx.records.get(created.value.id)?.passwordHash).toBe(`hash:${PASSWORD}`);
    expect(ctx.revoked).toEqual([]);
  });

  test("conta inexistente", async () => {
    const ctx = setup();
    expect(await ctx.service.resetPassword("x", OTHER_PASSWORD)).toMatchObject({
      ok: false,
      kind: "not_found",
    });
  });
});

describe("conta fantasma: ativar e fundir", () => {
  let ctx: ReturnType<typeof setup>;
  const ghost = (id: string, over: Partial<UserRecord> = {}) => {
    ctx.records.set(id, {
      id,
      email: `${id}@ifsc.edu.br`,
      name: "Zeca Quintal",
      code: null,
      roles: ["docente"],
      active: true,
      placeholder: true,
      passwordHash: "descartada",
      ...over,
    });
  };
  let realId = "";
  beforeEach(async () => {
    ctx = setup();
    ghost("g1");
    const created = await ctx.service.create(ctx.valid);
    if (!created.ok) throw new Error("setup");
    realId = created.value.id;
  });

  test("ativar grava e-mail normalizado e hash da senha e tira a marca", async () => {
    const result = await ctx.service.activatePlaceholder("g1", {
      email: " Zeca@IFSC.edu.br ",
      password: OTHER_PASSWORD,
    });
    expect(result).toMatchObject({
      ok: true,
      value: { id: "g1", email: "zeca@ifsc.edu.br", placeholder: false },
    });
    expect(ctx.records.get("g1")).toMatchObject({
      email: "zeca@ifsc.edu.br",
      passwordHash: `hash:${OTHER_PASSWORD}`,
      placeholder: false,
    });
  });

  test("ativar mantendo o e-mail presumido da própria fantasma é permitido", async () => {
    const result = await ctx.service.activatePlaceholder("g1", {
      email: "g1@ifsc.edu.br",
      password: OTHER_PASSWORD,
    });
    expect(result.ok).toBe(true);
  });

  test("e-mail de outra conta: conflito 'Este e-mail já está em uso'", async () => {
    expect(
      await ctx.service.activatePlaceholder("g1", {
        email: "ana@ifsc.edu.br",
        password: OTHER_PASSWORD,
      }),
    ).toEqual({
      ok: false,
      kind: "conflict",
      message: "Este e-mail já está em uso.",
      field: "email",
    });
    expect(ctx.records.get("g1")?.placeholder).toBe(true);
  });

  test("e-mail inválido, senha curta, conta inexistente ou já ativada são recusados", async () => {
    const valid = { email: "zeca@ifsc.edu.br", password: OTHER_PASSWORD };
    expect(await ctx.service.activatePlaceholder("g1", { ...valid, email: "x" })).toMatchObject({
      ok: false,
      kind: "validation",
      field: "email",
    });
    expect(
      await ctx.service.activatePlaceholder("g1", { ...valid, password: "curta" }), // betterleaks:allow
    ).toMatchObject({ ok: false, kind: "validation", field: "password" });
    expect(await ctx.service.activatePlaceholder("nao-existe", valid)).toMatchObject({
      ok: false,
      kind: "not_found",
    });
    expect(await ctx.service.activatePlaceholder(realId, valid)).toMatchObject({
      ok: false,
      kind: "validation",
    });
    expect(ctx.records.get("g1")?.placeholder).toBe(true);
  });

  test("fundir numa conta ativada e ativa apaga a fantasma", async () => {
    expect(await ctx.service.mergePlaceholder("g1", realId)).toEqual({ ok: true, value: null });
    expect(ctx.merged).toEqual([["g1", realId]]);
    expect(ctx.records.has("g1")).toBe(false);
  });

  test("fundir em outra fantasma, em conta inativa ou inexistente é recusado", async () => {
    ghost("g2");
    ghost("off", { placeholder: false, active: false });
    for (const target of ["g2", "off", "nao-existe", "g1"]) {
      expect(await ctx.service.mergePlaceholder("g1", target)).toMatchObject({
        ok: false,
        kind: "validation",
        field: "targetId",
      });
    }
    expect(ctx.merged).toEqual([]);
  });

  test("só uma fantasma pode ser fundida; origem inexistente é not_found", async () => {
    expect(await ctx.service.mergePlaceholder(realId, "g1")).toMatchObject({
      ok: false,
      kind: "validation",
    });
    expect(await ctx.service.mergePlaceholder("nao-existe", realId)).toMatchObject({
      ok: false,
      kind: "not_found",
    });
    expect(ctx.merged).toEqual([]);
  });
});

describe("listar", () => {
  test("devolve as contas do repositório", async () => {
    const ctx = setup();
    await ctx.service.create(ctx.valid);
    const roles: Role[] = (await ctx.service.list())[0]?.roles ?? [];
    expect(roles).toEqual(["horarios"]);
  });
});
