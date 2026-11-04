import { beforeEach, describe, expect, test } from "bun:test";
import { createAuthService, MIN_PASSWORD_LENGTH, validatePassword } from "#/application/auth";
import type {
  LoginAttemptRepository,
  PasswordHasher,
  Session,
  SessionRepository,
  UserRecord,
  UserRepository,
} from "#/application/ports";

const SECRET = "senha-de-teste-123"; // betterleaks:allow
const WRONG = "errada-errada-1"; // betterleaks:allow
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

function fakeHasher() {
  const calls: Array<{ password: string; stored: string }> = [];
  const hasher: PasswordHasher = {
    async hash(password) {
      return `fake:${password}`;
    },
    async verify(password, stored) {
      calls.push({ password, stored });
      return stored === `fake:${password}`;
    },
    needsRehash: (stored) => stored.startsWith("velho:"),
  };
  return { hasher, calls };
}

function setup(hasherOverride?: PasswordHasher) {
  let current = new Date("2026-11-02T12:00:00.000Z");
  let counter = 0;
  const clock = { now: () => new Date(current) };
  const random = {
    bytes: (n: number) => {
      counter += 1;
      return new Uint8Array(n).fill(counter);
    },
  };
  const record: UserRecord = {
    id: "u1",
    email: "ana@ifsc.edu.br",
    name: "Ana",
    code: "ANA",
    roles: ["admin"],
    active: true,
    placeholder: false,
    passwordHash: `fake:${SECRET}`,
  };
  const userMap = new Map<string, UserRecord>([[record.email, record]]);
  const users: UserRepository = {
    findByEmail: async (email) => userMap.get(email) ?? null,
    findById: async (id) => {
      const found = [...userMap.values()].find((u) => u.id === id);
      if (!found) return null;
      const { passwordHash: _hash, ...user } = found;
      return user;
    },
    create: async () => {
      throw new Error("não usado");
    },
    updatePasswordHash: async (id, passwordHash) => {
      for (const u of userMap.values()) if (u.id === id) u.passwordHash = passwordHash;
    },
    list: async () => [],
    findByCode: async () => null,
    update: async () => null,
    setActive: async () => true,
  };
  const sessionMap = new Map<string, Session>();
  const sessions: SessionRepository = {
    create: async (s) => {
      sessionMap.set(s.tokenHash, s);
    },
    findByTokenHash: async (h) => sessionMap.get(h) ?? null,
    extend: async (id, input) => {
      for (const s of sessionMap.values()) if (s.id === id) Object.assign(s, input);
    },
    deleteByTokenHash: async (h) => {
      sessionMap.delete(h);
    },
    revokeAllForUser: async (userId) => {
      for (const [hash, s] of sessionMap) if (s.userId === userId) sessionMap.delete(hash);
    },
  };
  const attemptList: Array<{ email: string; attemptedAt: string; success: boolean }> = [];
  const attempts: LoginAttemptRepository = {
    record: async (a) => {
      attemptList.push(a);
    },
    countFailuresSince: async (email, since) =>
      attemptList.filter((a) => a.email === email && !a.success && a.attemptedAt >= since).length,
    purgeOlderThan: async (before) => {
      for (let i = attemptList.length - 1; i >= 0; i--) {
        if ((attemptList[i]?.attemptedAt ?? "") < before) attemptList.splice(i, 1);
      }
    },
    clearFailures: async (email) => {
      for (let i = attemptList.length - 1; i >= 0; i--) {
        const a = attemptList[i];
        if (a && a.email === email && !a.success) attemptList.splice(i, 1);
      }
    },
  };
  const h = fakeHasher();
  const service = createAuthService({
    users,
    sessions,
    hasher: hasherOverride ?? h.hasher,
    attempts,
    clock,
    random,
  });
  return {
    service,
    record,
    sessionMap,
    attemptList,
    hasher: h,
    advance: (ms: number) => {
      current = new Date(current.getTime() + ms);
    },
    now: () => current,
  };
}

describe("validatePassword", () => {
  test("exige o tamanho mínimo", () => {
    expect(MIN_PASSWORD_LENGTH).toBe(10);
    expect(validatePassword("curta")).not.toBeNull();
    expect(validatePassword("123456789")).not.toBeNull();
    expect(validatePassword("1234567890")).toBeNull();
  });
});

describe("login", () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  test("senha correta cria sessão e devolve usuário sem hash", async () => {
    const result = await ctx.service.login(" Ana@IFSC.edu.br ", SECRET);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("esperava ok");
    expect(result.user).toEqual({
      id: "u1",
      email: "ana@ifsc.edu.br",
      name: "Ana",
      code: "ANA",
      roles: ["admin"],
      active: true,
      placeholder: false,
    });
    expect(result.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  test("guarda só o SHA-256 do token", async () => {
    const result = await ctx.service.login("ana@ifsc.edu.br", SECRET);
    if (!result.ok) throw new Error("esperava ok");
    const stored = [...ctx.sessionMap.values()];
    expect(stored).toHaveLength(1);
    const expected = new Bun.CryptoHasher("sha256").update(result.token).digest("hex");
    expect(stored[0]?.tokenHash).toBe(expected);
    expect(JSON.stringify(stored)).not.toContain(result.token);
    expect(Date.parse(stored[0]?.expiresAt ?? "") - ctx.now().getTime()).toBe(7 * DAY);
  });

  test("senha errada e email inexistente dão o mesmo resultado e ambos chamam verify", async () => {
    const wrong = await ctx.service.login("ana@ifsc.edu.br", WRONG);
    const unknown = await ctx.service.login("ninguem@ifsc.edu.br", SECRET);
    expect(wrong).toEqual({ ok: false, reason: "invalid" });
    expect(unknown).toEqual({ ok: false, reason: "invalid" });
    expect(ctx.hasher.calls).toHaveLength(2);
    expect(ctx.hasher.calls[1]?.stored).not.toBe(ctx.record.passwordHash);
    expect(ctx.hasher.calls[1]?.stored.length).toBeGreaterThan(0);
  });

  test("conta inativa não entra, mesmo com senha certa", async () => {
    ctx.record.active = false;
    expect(await ctx.service.login("ana@ifsc.edu.br", SECRET)).toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  test("bloqueia após 5 falhas em 15 minutos, mesmo com a senha certa", async () => {
    for (let i = 0; i < 5; i++) {
      expect(await ctx.service.login("ana@ifsc.edu.br", WRONG)).toEqual({
        ok: false,
        reason: "invalid",
      });
    }
    expect(await ctx.service.login("ana@ifsc.edu.br", SECRET)).toEqual({
      ok: false,
      reason: "locked",
    });
    ctx.advance(15 * MINUTE + 1);
    expect((await ctx.service.login("ana@ifsc.edu.br", SECRET)).ok).toBe(true);
  });

  test("tentativas bloqueadas não prolongam o bloqueio", async () => {
    for (let i = 0; i < 5; i++) await ctx.service.login("ana@ifsc.edu.br", WRONG);
    ctx.advance(10 * MINUTE);
    await ctx.service.login("ana@ifsc.edu.br", SECRET); // locked
    ctx.advance(6 * MINUTE);
    expect((await ctx.service.login("ana@ifsc.edu.br", SECRET)).ok).toBe(true);
  });

  test("bloqueio vale também para email inexistente (sem enumeração)", async () => {
    for (let i = 0; i < 5; i++) await ctx.service.login("ninguem@ifsc.edu.br", SECRET);
    expect(await ctx.service.login("ninguem@ifsc.edu.br", SECRET)).toEqual({
      ok: false,
      reason: "locked",
    });
  });

  test("4 falhas não bloqueiam e sucesso zera o contador", async () => {
    for (let i = 0; i < 4; i++) await ctx.service.login("ana@ifsc.edu.br", WRONG);
    expect((await ctx.service.login("ana@ifsc.edu.br", SECRET)).ok).toBe(true);
    for (let i = 0; i < 4; i++) await ctx.service.login("ana@ifsc.edu.br", WRONG);
    expect((await ctx.service.login("ana@ifsc.edu.br", SECRET)).ok).toBe(true);
  });

  test("falhas fora da janela de 15 minutos não contam", async () => {
    for (let i = 0; i < 4; i++) await ctx.service.login("ana@ifsc.edu.br", WRONG);
    ctx.advance(16 * MINUTE);
    await ctx.service.login("ana@ifsc.edu.br", WRONG);
    expect((await ctx.service.login("ana@ifsc.edu.br", SECRET)).ok).toBe(true);
  });

  test("re-hasheia a senha quando o hasher pede", async () => {
    ctx.record.passwordHash = "velho:x";
    ctx.hasher.hasher.verify = async () => true;
    await ctx.service.login("ana@ifsc.edu.br", SECRET);
    expect(ctx.record.passwordHash).toBe(`fake:${SECRET}`);
  });
});

describe("login: entradas, expurgo e hash fictício", () => {
  test("email ou senha enormes → invalid sem consultar banco nem registrar tentativa", async () => {
    const ctx = setup();
    const long = `${"a".repeat(250)}@x.br`;
    expect(await ctx.service.login(long, SECRET)).toEqual({ ok: false, reason: "invalid" });
    expect(await ctx.service.login("ana@ifsc.edu.br", "x".repeat(1025))).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(ctx.attemptList).toHaveLength(0);
    expect(ctx.hasher.calls).toHaveLength(2);
  });

  test("expurga tentativas com mais de 24 h", async () => {
    const ctx = setup();
    await ctx.service.login("ana@ifsc.edu.br", WRONG);
    ctx.advance(25 * 60 * MINUTE);
    await ctx.service.login("ana@ifsc.edu.br", SECRET);
    expect(
      ctx.attemptList.every(
        (a) => a.attemptedAt >= new Date(ctx.now().getTime() - DAY).toISOString(),
      ),
    ).toBe(true);
    expect(ctx.attemptList).toHaveLength(1);
  });

  test("hash fictício vem do hasher configurado (pbkdf2) e é memoizado", async () => {
    const ctx = setup();
    const real: PasswordHasher = {
      hash: async (p) => `pbkdf2$100000$${p}`,
      verify: async (p, stored) => stored === `pbkdf2$100000$${p}`,
      needsRehash: () => false,
    };
    const seen: string[] = [];
    let hashCalls = 0;
    const spy: PasswordHasher = {
      hash: async (p) => {
        hashCalls++;
        return real.hash(p);
      },
      verify: async (p, stored) => {
        seen.push(stored);
        return real.verify(p, stored);
      },
      needsRehash: real.needsRehash,
    };
    const service = createAuthService({
      users: {
        findByEmail: async () => null,
        findById: async () => null,
        create: async () => {
          throw new Error("x");
        },
        updatePasswordHash: async () => {},
        list: async () => [],
        findByCode: async () => null,
        update: async () => null,
        setActive: async () => true,
      },
      sessions: {
        create: async () => {},
        findByTokenHash: async () => null,
        extend: async () => {},
        deleteByTokenHash: async () => {},
        revokeAllForUser: async () => {},
      },
      hasher: spy,
      attempts: {
        record: async () => {},
        countFailuresSince: async () => 0,
        clearFailures: async () => {},
        purgeOlderThan: async () => {},
      },
      clock: { now: () => ctx.now() },
      random: { bytes: (n) => new Uint8Array(n).fill(7) },
    });
    await service.login("a@x.br", SECRET);
    await service.login("b@x.br", SECRET);
    expect(hashCalls).toBe(1);
    expect(seen).toHaveLength(2);
    expect(seen[0]?.startsWith("pbkdf2$100000$")).toBe(true);
    expect(seen[1]).toBe(seen[0] ?? "");
  });
});

describe("authenticate e logout", () => {
  let ctx: ReturnType<typeof setup>;
  let token: string;
  beforeEach(async () => {
    ctx = setup();
    const result = await ctx.service.login("ana@ifsc.edu.br", SECRET);
    if (!result.ok) throw new Error("esperava ok");
    token = result.token;
  });

  test("devolve o usuário para token válido", async () => {
    expect((await ctx.service.authenticate(token))?.id).toBe("u1");
  });

  test("token desconhecido ou vazio → null", async () => {
    expect(await ctx.service.authenticate("nada")).toBeNull();
    expect(await ctx.service.authenticate("")).toBeNull();
  });

  test("não renova quando falta mais de 1 dia", async () => {
    const before = [...ctx.sessionMap.values()][0]?.expiresAt;
    ctx.advance(2 * DAY);
    await ctx.service.authenticate(token);
    expect([...ctx.sessionMap.values()][0]?.expiresAt).toBe(before);
  });

  test("renova para 7 dias quando falta menos de 1 dia", async () => {
    ctx.advance(6.5 * DAY);
    expect(await ctx.service.authenticate(token)).not.toBeNull();
    const session = [...ctx.sessionMap.values()][0];
    expect(Date.parse(session?.expiresAt ?? "")).toBe(ctx.now().getTime() + 7 * DAY);
    expect(session?.lastSeenAt).toBe(ctx.now().toISOString());
  });

  test("sessão expirada → null e removida", async () => {
    ctx.advance(7 * DAY + 1);
    expect(await ctx.service.authenticate(token)).toBeNull();
    expect(ctx.sessionMap.size).toBe(0);
  });

  test("usuário desativado perde a sessão (removida)", async () => {
    ctx.record.active = false;
    expect(await ctx.service.authenticate(token)).toBeNull();
    expect(ctx.sessionMap.size).toBe(0);
  });

  test("logout revoga o token", async () => {
    await ctx.service.logout(token);
    expect(await ctx.service.authenticate(token)).toBeNull();
    expect(ctx.sessionMap.size).toBe(0);
  });
});

describe("hash fictício", () => {
  test("se a geração falha, a promessa memoizada é descartada e a próxima tentativa recupera", async () => {
    let failNext = true;
    const flaky: PasswordHasher = {
      async hash(password) {
        if (failNext) {
          failNext = false;
          throw new Error("falha transitória");
        }
        return `fake:${password}`;
      },
      verify: async (password, stored) => stored === `fake:${password}`,
      needsRehash: () => false,
    };
    const { service } = setup(flaky);
    await expect(service.login("ninguem@ifsc.edu.br", WRONG)).rejects.toThrow("falha transitória");
    const result = await service.login("ninguem@ifsc.edu.br", WRONG);
    expect(result).toEqual({ ok: false, reason: "invalid" });
  });
});

describe("hash fictício compartilhado", () => {
  test("duas instâncias do serviço com o mesmo hasher calculam o hash fictício uma só vez", async () => {
    let hashCalls = 0;
    const shared: PasswordHasher = {
      async hash(password) {
        hashCalls++;
        return `fake:${password}`;
      },
      verify: async (password, stored) => stored === `fake:${password}`,
      needsRehash: () => false,
    };
    const first = setup(shared);
    const second = setup(shared);
    await first.service.login("ninguem@ifsc.edu.br", WRONG);
    await second.service.login("outro@ifsc.edu.br", WRONG);
    expect(hashCalls).toBe(1);
  });
});
