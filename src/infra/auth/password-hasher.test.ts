import { describe, expect, test } from "bun:test";
import { createPasswordHasher } from "#/infra/auth/password-hasher";

const SECRET = "senha-de-teste-123"; // betterleaks:allow
const OTHER = "outra-senha-123"; // betterleaks:allow
const scrypt = createPasswordHasher({ algorithm: "scrypt", scryptN: 1024 });
const pbkdf2 = createPasswordHasher({ algorithm: "pbkdf2", scryptN: 1024 });

describe("scrypt", () => {
  test("formato autodescritivo e verify ok/errado", async () => {
    const stored = await scrypt.hash(SECRET);
    expect(stored).toMatch(/^scrypt\$1024\$8\$1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
    expect(await scrypt.verify(SECRET, stored)).toBe(true);
    expect(await scrypt.verify(OTHER, stored)).toBe(false);
  });

  test("salt aleatório: dois hashes da mesma senha diferem", async () => {
    expect(await scrypt.hash(SECRET)).not.toBe(await scrypt.hash(SECRET));
  });

  test("padrão usa N=16384", async () => {
    const stored = await createPasswordHasher({ algorithm: "scrypt" }).hash(SECRET);
    expect(stored.startsWith("scrypt$16384$8$1$")).toBe(true);
  });
});

describe("pbkdf2", () => {
  test("formato e verify", async () => {
    const stored = await pbkdf2.hash(SECRET);
    expect(stored).toMatch(/^pbkdf2\$100000\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
    expect(await pbkdf2.verify(SECRET, stored)).toBe(true);
    expect(await pbkdf2.verify(OTHER, stored)).toBe(false);
  });
});

describe("verify aceita os dois formatos, independente do configurado", () => {
  test("scrypt verifica hash pbkdf2 e vice-versa", async () => {
    expect(await scrypt.verify(SECRET, await pbkdf2.hash(SECRET))).toBe(true);
    expect(await pbkdf2.verify(SECRET, await scrypt.hash(SECRET))).toBe(true);
  });
});

describe("formatos inválidos → false", () => {
  const salt = "AAAAAAAAAAAAAAAAAAAAAA==";
  const key = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
  const cases: Record<string, string> = {
    vazio: "",
    lixo: "isso-nao-e-hash",
    algoritmo: `bcrypt$10$${salt}$${key}`,
    "scrypt sem campos": "scrypt$1024$8$1",
    "scrypt N não potência de 2": `scrypt$1000$8$1$${salt}$${key}`,
    "scrypt N enorme": `scrypt$1073741824$8$1$${salt}$${key}`,
    "scrypt N não numérico": `scrypt$abc$8$1$${salt}$${key}`,
    "scrypt r diferente de 8": `scrypt$1024$16$1$${salt}$${key}`,
    "scrypt p diferente de 1": `scrypt$1024$8$2$${salt}$${key}`,
    "pbkdf2 iterações menores": `pbkdf2$1000$${salt}$${key}`,
    "scrypt r zero": `scrypt$1024$0$1$${salt}$${key}`,
    "scrypt base64 inválido": `scrypt$1024$8$1$@@@$${key}`,
    "scrypt salt curto": `scrypt$1024$8$1$AAAA$${key}`,
    "scrypt chave curta": `scrypt$1024$8$1$${salt}$AAAA`,
    "pbkdf2 iterações zero": `pbkdf2$0$${salt}$${key}`,
    "pbkdf2 iterações enormes": `pbkdf2$99999999999$${salt}$${key}`,
    "pbkdf2 sem hash": `pbkdf2$100000$${salt}`,
    "campo extra": `pbkdf2$100000$${salt}$${key}$x`,
  };
  for (const [name, stored] of Object.entries(cases)) {
    test(name, async () => {
      expect(await scrypt.verify(SECRET, stored)).toBe(false);
    });
  }
});

describe("needsRehash", () => {
  test("false quando igual à configuração", async () => {
    expect(scrypt.needsRehash(await scrypt.hash(SECRET))).toBe(false);
    expect(pbkdf2.needsRehash(await pbkdf2.hash(SECRET))).toBe(false);
  });

  test("true quando algoritmo ou N diferem", async () => {
    expect(scrypt.needsRehash(await pbkdf2.hash(SECRET))).toBe(true);
    expect(pbkdf2.needsRehash(await scrypt.hash(SECRET))).toBe(true);
    const other = createPasswordHasher({ algorithm: "scrypt", scryptN: 2048 });
    expect(other.needsRehash(await scrypt.hash(SECRET))).toBe(true);
  });

  test("true para formato ilegível", () => {
    expect(scrypt.needsRehash("lixo")).toBe(true);
  });
});

describe("pepper", () => {
  test("hash com pepper só verifica com o mesmo pepper", async () => {
    const a = createPasswordHasher({
      algorithm: "scrypt",
      scryptN: 1024,
      pepper: "pepper-de-teste-a",
    });
    const b = createPasswordHasher({
      algorithm: "scrypt",
      scryptN: 1024,
      pepper: "pepper-de-teste-b",
    });
    const stored = await a.hash(SECRET);
    expect(await a.verify(SECRET, stored)).toBe(true);
    expect(await b.verify(SECRET, stored)).toBe(false);
    expect(await scrypt.verify(SECRET, stored)).toBe(false);
  });

  test("pbkdf2 também aplica o pepper", async () => {
    const a = createPasswordHasher({ algorithm: "pbkdf2", pepper: "pepper-de-teste-a" });
    const stored = await a.hash(SECRET);
    expect(await a.verify(SECRET, stored)).toBe(true);
    expect(await pbkdf2.verify(SECRET, stored)).toBe(false);
  });
});
