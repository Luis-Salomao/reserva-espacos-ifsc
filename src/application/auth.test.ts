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

function setup() {
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
  };
  const attemptList: Array<{ email: string; attemptedAt: string; success: boolean }> = [];
  const attempts: LoginAttemptRepository = {
    record: async (a) => {
      attemptList.push(a);
    },
    countFailuresSince: async (email, since) =>
      attemptList.filter((a) => a.email === email && !a.success && a.attemptedAt >= since).length,
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
    hasher: h.hasher,
    attempts,
    clock,
    random,
  });
  return {
    service,
    record,
    sessionMap,
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

  test("usuário desativado perde a sessão", async () => {
    ctx.record.active = false;
    expect(await ctx.service.authenticate(token)).toBeNull();
  });

  test("logout revoga o token", async () => {
    await ctx.service.logout(token);
    expect(await ctx.service.authenticate(token)).toBeNull();
    expect(ctx.sessionMap.size).toBe(0);
  });
});
