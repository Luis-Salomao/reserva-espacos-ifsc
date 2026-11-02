import { describe, expect, spyOn, test } from "bun:test";
import type { LoginResult } from "#/application/auth";
import type { User } from "#/domain/user";
import {
  type AuthPort,
  handleLogin,
  handleLogout,
  LOGIN_ERROR_MESSAGES,
  loginErrorFromSearch,
  processLogin,
  processLogout,
  requireRole,
  resolveSession,
} from "./auth-handlers.ts";
import { IMPORT_ROLES } from "./session.ts";

const FAKE_PASSWORD = "senha-de-teste-123"; // betterleaks:allow
const OTHER_PASSWORD = "outra-coisa-1"; // betterleaks:allow
const ana: User = {
  id: "u1",
  email: "ana@ifsc.edu.br",
  name: "Ana",
  code: null,
  roles: ["horarios"],
  active: true,
};

function fakeAuth(overrides: Partial<AuthPort> = {}) {
  const calls: string[] = [];
  const auth: AuthPort = {
    login: async (email, password): Promise<LoginResult> => {
      calls.push(`login:${email}`);
      if (email === "ana@ifsc.edu.br" && password === FAKE_PASSWORD) {
        return { ok: true, token: "tok-123", user: ana };
      }
      if (email === "bloqueada@ifsc.edu.br") return { ok: false, reason: "locked" };
      return { ok: false, reason: "invalid" };
    },
    authenticate: async (token) => (token === "tok-123" ? ana : null),
    logout: async (token) => {
      calls.push(`logout:${token}`);
    },
    ...overrides,
  };
  return { auth, calls };
}

const HTTPS = "https://reservas.ifsc.edu.br/api/entrar";
const LOCAL = "http://localhost:3000/api/entrar";

describe("processLogin", () => {
  test("sucesso: cookie de sessão e volta ao destino seguro", async () => {
    const { auth } = fakeAuth();
    const outcome = await processLogin(
      { email: "ana@ifsc.edu.br", password: FAKE_PASSWORD, voltar: "/importar", url: HTTPS },
      auth,
    );
    expect(outcome.location).toBe("/importar");
    expect(outcome.setCookie).toBe(
      "sid=tok-123; Max-Age=604800; Path=/; HttpOnly; Secure; SameSite=Lax",
    );
  });

  test("COOKIE_SECURE=false tira Secure em rede local com HTTP; true força em localhost", async () => {
    const { auth } = fakeAuth();
    const lan = await processLogin(
      {
        email: "ana@ifsc.edu.br",
        password: FAKE_PASSWORD,
        voltar: "",
        url: "http://192.168.0.10:3000/api/entrar",
        cookieSecure: "false",
      },
      auth,
    );
    expect(lan.setCookie).not.toContain("Secure");
    const forced = await processLogin(
      {
        email: "ana@ifsc.edu.br",
        password: FAKE_PASSWORD,
        voltar: "",
        url: LOCAL,
        cookieSecure: "true",
      },
      auth,
    );
    expect(forced.setCookie).toContain("Secure");
  });

  test("revoga a sessão anterior ao entrar de novo", async () => {
    const { auth, calls } = fakeAuth();
    await processLogin(
      {
        email: "ana@ifsc.edu.br",
        password: FAKE_PASSWORD,
        voltar: "",
        url: HTTPS,
        previousToken: "antigo-1",
      },
      auth,
    );
    expect(calls).toEqual(["login:ana@ifsc.edu.br", "logout:antigo-1"]);
  });

  test("login recusado mantém a sessão anterior", async () => {
    const { auth, calls } = fakeAuth();
    await processLogin(
      {
        email: "ana@ifsc.edu.br",
        password: OTHER_PASSWORD,
        voltar: "",
        url: HTTPS,
        previousToken: "antigo-1",
      },
      auth,
    );
    expect(calls).toEqual(["login:ana@ifsc.edu.br"]);
  });

  test("handleLogin repassa o cookie sid anterior", async () => {
    const { auth, calls } = fakeAuth();
    const body = new URLSearchParams({
      email: "ana@ifsc.edu.br",
      password: FAKE_PASSWORD,
    }).toString();
    const request = {
      method: "POST",
      url: "http://192.168.0.10:3000/api/entrar",
      headers: new Headers({
        "content-type": "application/x-www-form-urlencoded",
        "content-length": String(new TextEncoder().encode(body).length),
        cookie: "sid=antigo-2",
      }),
      body: new Response(body).body,
    } as unknown as Request;
    const response = await handleLogin(request, auth, "false");
    expect(response.status).toBe(303);
    expect(calls).toContain("logout:antigo-2");
  });

  test("em localhost o cookie não leva Secure", async () => {
    const { auth } = fakeAuth();
    const outcome = await processLogin(
      { email: "ana@ifsc.edu.br", password: FAKE_PASSWORD, voltar: "", url: LOCAL },
      auth,
    );
    expect(outcome.setCookie).not.toContain("Secure");
    expect(outcome.location).toBe("/");
  });

  test("destino externo é ignorado", async () => {
    const { auth } = fakeAuth();
    const outcome = await processLogin(
      { email: "ana@ifsc.edu.br", password: FAKE_PASSWORD, voltar: "//evil.com", url: HTTPS },
      auth,
    );
    expect(outcome.location).toBe("/");
  });

  test("senha errada e email inexistente dão a mesma resposta, sem cookie", async () => {
    const { auth } = fakeAuth();
    const wrongPassword = await processLogin(
      { email: "ana@ifsc.edu.br", password: OTHER_PASSWORD, voltar: "/importar", url: HTTPS },
      auth,
    );
    const unknown = await processLogin(
      { email: "ninguem@ifsc.edu.br", password: OTHER_PASSWORD, voltar: "/importar", url: HTTPS },
      auth,
    );
    expect(wrongPassword).toEqual(unknown);
    expect(wrongPassword.setCookie).toBeNull();
    expect(wrongPassword.location).toBe("/entrar?erro=invalido&voltar=%2Fimportar");
  });

  test("conta bloqueada tem aviso próprio", async () => {
    const { auth } = fakeAuth();
    const outcome = await processLogin(
      { email: "bloqueada@ifsc.edu.br", password: "x", voltar: "", url: HTTPS },
      auth,
    );
    expect(outcome.location).toBe("/entrar?erro=bloqueado");
    expect(outcome.setCookie).toBeNull();
  });

  test("falha interna vira erro genérico, sem vazar detalhes", async () => {
    const log = spyOn(console, "error").mockImplementation(() => {});
    const { auth } = fakeAuth({
      login: async () => {
        throw new Error("banco indisponível: senha=segredo");
      },
    });
    const outcome = await processLogin(
      { email: "ana@ifsc.edu.br", password: FAKE_PASSWORD, voltar: "", url: HTTPS },
      auth,
    );
    expect(outcome.location).toBe("/entrar?erro=falha");
    expect(outcome.setCookie).toBeNull();
    expect(JSON.stringify(log.mock.calls)).not.toContain("segredo");
    log.mockRestore();
  });
});

describe("loginErrorFromSearch / mensagens", () => {
  test("só códigos conhecidos viram mensagem", () => {
    expect(LOGIN_ERROR_MESSAGES.invalido).toBe("E-mail ou senha incorretos.");
    expect(LOGIN_ERROR_MESSAGES.bloqueado).toBe(
      "Muitas tentativas. Tente novamente em alguns minutos.",
    );
    expect(loginErrorFromSearch("invalido")).toBe("invalido");
    expect(loginErrorFromSearch("bloqueado")).toBe("bloqueado");
    expect(loginErrorFromSearch("falha")).toBe("falha");
    expect(loginErrorFromSearch("<script>")).toBeUndefined();
    expect(loginErrorFromSearch(undefined)).toBeUndefined();
    expect(loginErrorFromSearch(42)).toBeUndefined();
  });
});

describe("handleLogin", () => {
  function post(body: string, extra: Record<string, string> = {}): Request {
    const length = new TextEncoder().encode(body).length;
    return {
      method: "POST",
      url: HTTPS,
      headers: new Headers({
        "content-type": "application/x-www-form-urlencoded",
        "content-length": String(length),
        ...extra,
      }),
      body: new Response(body).body,
    } as unknown as Request;
  }

  test("lê o formulário e responde com redirecionamento 303", async () => {
    const { auth, calls } = fakeAuth();
    const form = new URLSearchParams({
      email: "ana@ifsc.edu.br",
      password: FAKE_PASSWORD,
      voltar: "/importar",
    });
    const response = await handleLogin(post(form.toString()), auth);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/importar");
    expect(calls).toEqual(["login:ana@ifsc.edu.br"]);
  });

  test("corpo grande demais é recusado sem tentar o login", async () => {
    const { auth, calls } = fakeAuth();
    const response = await handleLogin(post(`email=${"a".repeat(20_000)}`), auth);
    expect(response.status).toBe(413);
    expect(calls).toEqual([]);
  });

  test("corpo maior que o limite com Content-Length mentindo também é cortado", async () => {
    const { auth, calls } = fakeAuth();
    const big = `email=${"a".repeat(20_000)}`;
    const response = await handleLogin(post(big, { "content-length": "10" }), auth);
    expect(response.status).toBe(413);
    expect(calls).toEqual([]);
  });

  test("sem Content-Length válido → 411", async () => {
    const { auth } = fakeAuth();
    const request = post("email=a");
    request.headers.delete("content-length");
    expect((await handleLogin(request, auth)).status).toBe(411);
  });

  test("campos ausentes tratados como vazios", async () => {
    const { auth } = fakeAuth();
    const response = await handleLogin(post("x=1"), auth);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/entrar?erro=invalido");
  });
});

describe("logout", () => {
  test("revoga a sessão e limpa o cookie", async () => {
    const { auth, calls } = fakeAuth();
    const outcome = await processLogout("tok-123", HTTPS, auth);
    expect(calls).toEqual(["logout:tok-123"]);
    expect(outcome.location).toBe("/");
    expect(outcome.setCookie).toBe("sid=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax");
  });

  test("sem token ainda limpa o cookie", async () => {
    const { auth, calls } = fakeAuth();
    const outcome = await processLogout(null, LOCAL, auth);
    expect(calls).toEqual([]);
    expect(outcome.setCookie).toContain("Max-Age=0");
  });

  test("handleLogout lê o cookie e redireciona 303", async () => {
    const { auth, calls } = fakeAuth();
    const request = {
      method: "POST",
      url: "https://reservas.ifsc.edu.br/api/sair",
      headers: new Headers({ cookie: "x=1; sid=tok-123" }),
    } as unknown as Request;
    const response = await handleLogout(request, auth);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/");
    expect(calls).toEqual(["logout:tok-123"]);
  });
});

describe("resolveSession", () => {
  test("cookie válido: usuário e cookie renovado", async () => {
    const { auth } = fakeAuth();
    const result = await resolveSession("sid=tok-123", HTTPS, auth);
    expect(result.user).toEqual(ana);
    expect(result.setCookie).toContain("sid=tok-123; Max-Age=604800");
  });

  test("sem cookie ou token desconhecido: sem usuário, nada a gravar", async () => {
    const { auth } = fakeAuth();
    expect(await resolveSession(null, HTTPS, auth)).toEqual({ user: null, setCookie: null });
    expect(await resolveSession("sid=outro", HTTPS, auth)).toEqual({
      user: null,
      setCookie: null,
    });
  });
});

describe("requireRole", () => {
  function req(cookie: string | null): Pick<Request, "url" | "headers"> {
    return {
      url: "https://reservas.ifsc.edu.br/api/import-preview",
      headers: new Headers(cookie === null ? {} : { cookie }),
    };
  }

  test("sem sessão → 401", async () => {
    const { auth } = fakeAuth();
    const result = await requireRole(req(null), auth, IMPORT_ROLES);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });

  test("papel errado → 403", async () => {
    const { auth } = fakeAuth();
    const result = await requireRole(req("sid=tok-123"), auth, ["admin"]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });

  test("papel certo devolve o usuário", async () => {
    const { auth } = fakeAuth();
    const result = await requireRole(req("sid=tok-123"), auth, IMPORT_ROLES);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.user).toEqual(ana);
  });
});
