import { createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import type { PasswordHasher } from "#/application/ports";

export type PasswordHasherConfig = {
  algorithm: "scrypt" | "pbkdf2";
  /** Custo do scrypt (potência de 2). Padrão 16384. */
  scryptN?: number;
  /** Segredo opcional: a senha passa por HMAC-SHA-256 com ele antes do hash. */
  pepper?: string;
};

const DEFAULT_SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const MAX_SCRYPT_N = 65536;
const MIN_SCRYPT_N = 1024;
const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const KEY_BYTES = 32;

type Parsed =
  | { kind: "scrypt"; n: number; r: number; p: number; salt: Buffer; key: Buffer }
  | { kind: "pbkdf2"; iterations: number; salt: Buffer; key: Buffer };

function decodeBase64(value: string, length: number): Buffer | null {
  const buffer = Buffer.from(value, "base64");
  if (buffer.length !== length || buffer.toString("base64") !== value) return null;
  return buffer;
}

function parseInteger(value: string | undefined): number | null {
  if (value === undefined || !/^\d{1,10}$/.test(value)) return null;
  return Number(value);
}

function isPowerOfTwo(value: number): boolean {
  return value > 0 && (value & (value - 1)) === 0;
}

function parseStored(stored: string): Parsed | null {
  const parts = stored.split("$");
  if (parts[0] === "scrypt" && parts.length === 6) {
    const n = parseInteger(parts[1]);
    const r = parseInteger(parts[2]);
    const p = parseInteger(parts[3]);
    const salt = decodeBase64(parts[4] ?? "", SALT_BYTES);
    const key = decodeBase64(parts[5] ?? "", KEY_BYTES);
    if (n === null || r === null || p === null || !salt || !key) return null;
    if (!isPowerOfTwo(n) || n < MIN_SCRYPT_N || n > MAX_SCRYPT_N) return null;
    if (r !== SCRYPT_R || p !== SCRYPT_P) return null;
    return { kind: "scrypt", n, r, p, salt, key };
  }
  if (parts[0] === "pbkdf2" && parts.length === 4) {
    const iterations = parseInteger(parts[1]);
    const salt = decodeBase64(parts[2] ?? "", SALT_BYTES);
    const key = decodeBase64(parts[3] ?? "", KEY_BYTES);
    if (iterations === null || !salt || !key) return null;
    if (iterations !== PBKDF2_ITERATIONS) return null;
    return { kind: "pbkdf2", iterations, salt, key };
  }
  return null;
}

function deriveScrypt(
  password: string,
  salt: Buffer,
  n: number,
  r: number,
  p: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_BYTES, { N: n, r, p, maxmem: 256 * n * r }, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

async function derivePbkdf2(password: string, salt: Buffer, iterations: number): Promise<Buffer> {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: new Uint8Array(salt), iterations },
    material,
    KEY_BYTES * 8,
  );
  return Buffer.from(bits);
}

/**
 * Hasher de senha: scrypt (padrão, via node:crypto) ou PBKDF2-SHA-256 (100 000 iterações, limite
 * do Web Crypto no Workers). `verify` aceita os dois formatos; `needsRehash` compara com a config.
 */
export function createPasswordHasher(config: PasswordHasherConfig): PasswordHasher {
  const scryptN = config.scryptN ?? DEFAULT_SCRYPT_N;
  const pepper = config.pepper;
  const prepare = (password: string): string =>
    pepper ? createHmac("sha256", pepper).update(password).digest("base64") : password;

  return {
    async hash(password) {
      const input = prepare(password);
      const salt = randomBytes(SALT_BYTES);
      if (config.algorithm === "scrypt") {
        const key = await deriveScrypt(input, salt, scryptN, SCRYPT_R, SCRYPT_P);
        return `scrypt$${scryptN}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("base64")}$${key.toString("base64")}`;
      }
      const key = await derivePbkdf2(input, salt, PBKDF2_ITERATIONS);
      return `pbkdf2$${PBKDF2_ITERATIONS}$${salt.toString("base64")}$${key.toString("base64")}`;
    },

    async verify(password, stored) {
      const parsed = parseStored(stored);
      if (!parsed) return false;
      const input = prepare(password);
      const derived =
        parsed.kind === "scrypt"
          ? await deriveScrypt(input, parsed.salt, parsed.n, parsed.r, parsed.p)
          : await derivePbkdf2(input, parsed.salt, parsed.iterations);
      return timingSafeEqual(derived, parsed.key);
    },

    needsRehash(stored) {
      const parsed = parseStored(stored);
      if (!parsed || parsed.kind !== config.algorithm) return true;
      if (parsed.kind === "scrypt") {
        return parsed.n !== scryptN || parsed.r !== SCRYPT_R || parsed.p !== SCRYPT_P;
      }
      return parsed.iterations !== PBKDF2_ITERATIONS;
    },
  };
}
