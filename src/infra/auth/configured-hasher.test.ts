import { describe, expect, test } from "bun:test";
import { createConfiguredHasher } from "#/infra/auth/configured-hasher";

describe("createConfiguredHasher", () => {
  test("mesma configuração devolve o mesmo hasher (cache de módulo)", () => {
    const env = { PASSWORD_HASH: "scrypt", PASSWORD_SCRYPT_N: 1024 } as const;
    expect(createConfiguredHasher(env)).toBe(createConfiguredHasher({ ...env }));
  });

  test("configurações diferentes (algoritmo, custo, pepper) geram hashers diferentes", () => {
    const base = { PASSWORD_HASH: "scrypt", PASSWORD_SCRYPT_N: 1024 } as const;
    const a = createConfiguredHasher(base);
    expect(createConfiguredHasher({ ...base, PASSWORD_SCRYPT_N: 2048 })).not.toBe(a);
    expect(createConfiguredHasher({ ...base, PASSWORD_HASH: "pbkdf2" })).not.toBe(a);
    expect(createConfiguredHasher({ ...base, PASSWORD_PEPPER: "p" })).not.toBe(a);
  });

  test("respeita a configuração: hash gerado usa o custo pedido", async () => {
    const hasher = createConfiguredHasher({ PASSWORD_HASH: "scrypt", PASSWORD_SCRYPT_N: 1024 });
    expect((await hasher.hash("senha-qualquer-1")).startsWith("scrypt$1024$")).toBe(true);
  });
});
