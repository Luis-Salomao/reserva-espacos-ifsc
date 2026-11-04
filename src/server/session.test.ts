import { describe, expect, test } from "bun:test";
import type { User } from "#/domain/user";
import {
  authorizeRoles,
  buildClearedSessionCookie,
  buildSessionCookie,
  canViewHome,
  csrfRejection,
  decideRouteAccess,
  IMPORT_ROLES,
  isSecureUrl,
  parseSessionToken,
  safeRedirectTarget,
} from "./session.ts";

function user(roles: User["roles"]): User {
  return {
    id: "u1",
    email: "ana@ifsc.edu.br",
    name: "Ana",
    code: null,
    roles,
    active: true,
    placeholder: false,
  };
}

describe("isSecureUrl", () => {
  test("só http://localhost e http://127.0.0.1 ficam sem Secure", () => {
    expect(isSecureUrl("http://localhost:3000/entrar")).toBe(false);
    expect(isSecureUrl("http://127.0.0.1:3000/")).toBe(false);
    expect(isSecureUrl("https://localhost:3000/")).toBe(true);
    expect(isSecureUrl("https://reservas.ifsc.edu.br/")).toBe(true);
    expect(isSecureUrl("http://reservas.ifsc.edu.br/")).toBe(true);
    expect(isSecureUrl("http://localhost.evil.com/")).toBe(true);
  });
});

describe("isSecureUrl com COOKIE_SECURE", () => {
  test("true força Secure e false remove, mesmo em HTTP fora de localhost", () => {
    expect(isSecureUrl("http://localhost:3000/", "true")).toBe(true);
    expect(isSecureUrl("http://192.168.0.10:3000/", "false")).toBe(false);
    expect(isSecureUrl("https://reservas.ifsc.edu.br/", "false")).toBe(false);
  });

  test("auto mantém a regra padrão", () => {
    expect(isSecureUrl("http://localhost:3000/", "auto")).toBe(false);
    expect(isSecureUrl("http://192.168.0.10:3000/", "auto")).toBe(true);
  });
});

describe("cookie de sessão", () => {
  test("tem os atributos exigidos", () => {
    const cookie = buildSessionCookie("tok_en-1", true);
    expect(cookie).toBe("sid=tok_en-1; Max-Age=604800; Path=/; HttpOnly; Secure; SameSite=Lax");
  });

  test("sem Secure em localhost", () => {
    const cookie = buildSessionCookie("abc", false);
    expect(cookie).not.toContain("Secure");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
  });

  test("limpeza zera o valor e expira", () => {
    const cookie = buildClearedSessionCookie(true);
    expect(cookie).toBe("sid=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax");
  });

  test("recusa token com caracteres que quebrariam o cabeçalho", () => {
    expect(() => buildSessionCookie("a;b", true)).toThrow();
    expect(() => buildSessionCookie("a\r\nSet-Cookie: x=1", true)).toThrow();
    expect(() => buildSessionCookie("", true)).toThrow();
  });
});

describe("parseSessionToken", () => {
  test("extrai sid entre outros cookies", () => {
    expect(parseSessionToken("a=1; sid=abc_DEF-123; b=2")).toBe("abc_DEF-123");
    expect(parseSessionToken("sid=abc")).toBe("abc");
  });

  test("ausente, vazio ou inválido devolve null", () => {
    expect(parseSessionToken(null)).toBeNull();
    expect(parseSessionToken("")).toBeNull();
    expect(parseSessionToken("a=1")).toBeNull();
    expect(parseSessionToken("sid=")).toBeNull();
    expect(parseSessionToken("xsid=abc")).toBeNull();
    expect(parseSessionToken("sid=a b")).toBeNull();
    expect(parseSessionToken(`sid=${"a".repeat(200)}`)).toBeNull();
  });
});

describe("csrfRejection", () => {
  const url = "https://reservas.ifsc.edu.br/api/sair";
  // O Request do runtime de testes (happy-dom) descarta cabeçalhos proibidos como Origin.
  function req(method: string, headers: Record<string, string> = {}): Request {
    return { method, url, headers: new Headers(headers) } as unknown as Request;
  }

  test("POST/PUT/PATCH/DELETE sem Origin → 403", () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect(csrfRejection(req(method))?.status).toBe(403);
    }
  });

  test("Origin de outro site ou null → 403", () => {
    expect(csrfRejection(req("POST", { origin: "https://evil.example" }))?.status).toBe(403);
    expect(csrfRejection(req("POST", { origin: "null" }))?.status).toBe(403);
    expect(csrfRejection(req("POST", { origin: "http://reservas.ifsc.edu.br" }))?.status).toBe(403);
    expect(
      csrfRejection(req("POST", { origin: "https://reservas.ifsc.edu.br.evil.com" }))?.status,
    ).toBe(403);
  });

  test("Origin igual à origem da requisição passa", () => {
    expect(csrfRejection(req("POST", { origin: "https://reservas.ifsc.edu.br" }))).toBeNull();
    expect(csrfRejection(req("DELETE", { origin: "https://reservas.ifsc.edu.br" }))).toBeNull();
  });

  test("Sec-Fetch-Site sozinho não substitui o Origin", () => {
    expect(csrfRejection(req("POST", { "sec-fetch-site": "same-origin" }))?.status).toBe(403);
  });

  test("com PUBLIC_ORIGIN, só essa origem passa (mesmo com a URL interna diferente)", () => {
    const internal = {
      method: "POST",
      url: "http://127.0.0.1:3000/api/sair",
      headers: new Headers({ origin: "https://reservas.campus.edu.br" }),
    } as unknown as Request;
    expect(csrfRejection(internal)?.status).toBe(403);
    expect(csrfRejection(internal, "https://reservas.campus.edu.br")).toBeNull();
    const own = {
      method: "POST",
      url: "http://127.0.0.1:3000/api/sair",
      headers: new Headers({ origin: "http://127.0.0.1:3000" }),
    } as unknown as Request;
    expect(csrfRejection(own, "https://reservas.campus.edu.br")?.status).toBe(403);
  });

  test("GET e HEAD não são verificados", () => {
    expect(csrfRejection(req("GET"))).toBeNull();
    expect(csrfRejection(req("HEAD"))).toBeNull();
    expect(csrfRejection(req("OPTIONS"))).toBeNull();
  });
});

describe("authorizeRoles", () => {
  test("sem sessão → 401", () => {
    expect(authorizeRoles(null, IMPORT_ROLES)).toEqual({ ok: false, status: 401 });
  });

  test("papel errado → 403", () => {
    expect(authorizeRoles(user(["docente"]), IMPORT_ROLES)).toEqual({ ok: false, status: 403 });
  });

  test("admin e horarios importam; basta um dos papéis", () => {
    expect(authorizeRoles(user(["admin"]), IMPORT_ROLES).ok).toBe(true);
    expect(authorizeRoles(user(["horarios"]), IMPORT_ROLES).ok).toBe(true);
    expect(authorizeRoles(user(["docente", "horarios"]), IMPORT_ROLES).ok).toBe(true);
  });

  test("sem papéis exigidos nenhum usuário passa", () => {
    expect(authorizeRoles(user(["admin"]), []).ok).toBe(false);
  });
});

describe("decideRouteAccess", () => {
  test("sem sessão manda para o login com o destino", () => {
    expect(decideRouteAccess(null, IMPORT_ROLES, "/importar")).toEqual({
      kind: "login",
      voltar: "/importar",
    });
  });
  test("papel errado manda para o início", () => {
    expect(decideRouteAccess(user(["docente"]), IMPORT_ROLES, "/importar")).toEqual({
      kind: "forbidden",
    });
  });
  test("papel certo libera", () => {
    expect(decideRouteAccess(user(["admin"]), IMPORT_ROLES, "/importar")).toEqual({
      kind: "allow",
    });
  });
});

describe("canViewHome", () => {
  test("público quando PUBLIC_READ=true", () => {
    expect(canViewHome(true, null)).toBe(true);
  });
  test("com PUBLIC_READ=false exige sessão", () => {
    expect(canViewHome(false, null)).toBe(false);
    expect(canViewHome(false, user(["docente"]))).toBe(true);
  });
});

describe("safeRedirectTarget", () => {
  test("aceita caminhos relativos do próprio site", () => {
    expect(safeRedirectTarget("/importar")).toBe("/importar");
    expect(safeRedirectTarget("/a/b?x=1#h")).toBe("/a/b?x=1#h");
    expect(safeRedirectTarget("/")).toBe("/");
  });

  test("recusa tudo o mais e cai em /", () => {
    for (const bad of [
      "//evil.com",
      "https://evil.com",
      "evil.com",
      "",
      `/${String.fromCharCode(92)}evil.com`,
      "/%5Cevil.com",
      "/a\r\nSet-Cookie: x=1",
      "javascript:alert(1)",
      "/\tevil.com",
    ]) {
      expect(safeRedirectTarget(bad)).toBe("/");
    }
    expect(safeRedirectTarget(undefined)).toBe("/");
    expect(safeRedirectTarget(null)).toBe("/");
  });

  test("recusa destino que volta ao login (evita laço)", () => {
    expect(safeRedirectTarget("/entrar")).toBe("/");
    expect(safeRedirectTarget("/entrar?voltar=/importar")).toBe("/");
    expect(safeRedirectTarget("/api/sair")).toBe("/");
  });
});
