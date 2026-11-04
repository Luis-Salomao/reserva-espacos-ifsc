import { describe, expect, spyOn, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Role, User } from "#/domain/user";
import { MAX_XML_BYTES } from "#/import-asc/read.ts";
import type { AuthPort } from "./auth-handlers.ts";
import { handlePreviewRequest, type PreviewImportResult } from "./import-preview.ts";

const FIXTURE = join(import.meta.dir, "../../test/fixtures/asc/complete.xml");

function userWith(roles: Role[]): User {
  return {
    id: "u",
    email: "u@x.org",
    name: "U",
    code: null,
    roles,
    active: true,
    placeholder: false,
  };
}

const AUTH: AuthPort = {
  login: async () => ({ ok: false, reason: "invalid" }),
  authenticate: async (token) =>
    token === "adm" ? userWith(["admin"]) : token === "doc" ? userWith(["docente"]) : null,
  logout: async () => {},
};

const BASE = { url: "https://reservas.ifsc.edu.br/api/import-preview" };
const withCookie = (token: string | null, extra: Record<string, string> = {}) =>
  new Headers({ ...extra, ...(token === null ? {} : { cookie: `sid=${token}` }) });

/** O `Request` do runtime de testes descarta `Content-Length`; por isso a requisição é montada à mão. */
function post(body: string): Request {
  const length = new TextEncoder().encode(body).length;
  return {
    ...BASE,
    headers: withCookie("adm", { "content-length": String(length) }),
    body: length === 0 ? null : new Response(body).body,
  } as unknown as Request;
}

async function run(request: Request): Promise<{ status: number; json: PreviewImportResult }> {
  const response = await handlePreviewRequest(request, AUTH, "auto");
  return { status: response.status, json: (await response.json()) as PreviewImportResult };
}

/** Requisição falsa: só cabeçalhos e corpo, para simular o que o `Request` real não permite. */
function fake(contentLength: string, body: ReadableStream<Uint8Array> | null): Request {
  return {
    ...BASE,
    headers: withCookie("adm", { "content-length": contentLength }),
    body,
  } as unknown as Request;
}

describe("handlePreviewRequest", () => {
  test("devolve a prévia para o XML da fixture", async () => {
    const { status, json } = await run(post(readFileSync(FIXTURE, "utf8")));
    expect(status).toBe(200);
    expect(json.ok).toBe(true);
    if (json.ok) {
      expect(json.preview.counts.lessons).toBe(2);
      expect(Object.keys(json.preview)).not.toContain("timetable");
    }
  });

  test("arquivo que não é XML dá mensagem amigável, sem stack", async () => {
    const { status, json } = await run(post("isto não é xml"));
    expect(status).toBe(422);
    expect(json).toEqual({ ok: false, message: "O arquivo não é um XML válido." });
  });

  test("corpo vazio pede para selecionar um arquivo", async () => {
    const { status, json } = await run(post(""));
    expect(status).toBe(400);
    expect(json).toEqual({ ok: false, message: "Selecione um arquivo XML para importar." });
  });

  test("recusa Content-Length acima do limite sem tocar no corpo", async () => {
    let touched = false;
    const request = {
      ...BASE,
      headers: withCookie("adm", { "content-length": String(MAX_XML_BYTES + 1) }),
      get body() {
        touched = true;
        return null;
      },
    } as unknown as Request;
    const { status, json } = await run(request);
    expect(status).toBe(413);
    expect(json).toEqual({ ok: false, message: "O arquivo é maior que o limite de 10 MB." });
    expect(touched).toBe(false);
  });

  test("exige Content-Length", async () => {
    const request = { ...BASE, headers: withCookie("adm"), body: null } as unknown as Request;
    const { status } = await run(request);
    expect(status).toBe(411);
  });

  test("cancela a leitura quando o corpo real passa do limite apesar do cabeçalho", async () => {
    const chunk = new Uint8Array(1024 * 1024);
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        sent += 1;
        controller.enqueue(chunk);
      },
    });
    const { status } = await run(fake("10", stream));
    expect(status).toBe(413);
    expect(sent).toBeLessThan(20);
  });

  test("falha inesperada vira mensagem genérica e loga só o nome do erro", async () => {
    const request = {
      ...BASE,
      headers: withCookie("adm", { "content-length": "5" }),
      get body(): never {
        throw new TypeError("conteúdo secreto");
      },
    } as unknown as Request;
    const log = spyOn(console, "error").mockImplementation(() => {});
    try {
      const { status, json } = await run(request);
      expect(status).toBe(500);
      expect(JSON.stringify(json)).not.toContain("secreto");
      expect(JSON.stringify(log.mock.calls)).not.toContain("secreto");
      expect(log.mock.calls[0]?.[1]).toBe("TypeError");
    } finally {
      log.mockRestore();
    }
  });

  for (const [token, status] of [
    [null, 401],
    ["doc", 403],
  ] as const) {
    test(`sem permissão (${status}) responde antes de ler o corpo`, async () => {
      let touched = false;
      const request = {
        ...BASE,
        headers: withCookie(token, { "content-length": "5" }),
        get body() {
          touched = true;
          return null;
        },
      } as unknown as Request;
      const response = await handlePreviewRequest(request, AUTH, "auto");
      expect(response.status).toBe(status);
      expect(touched).toBe(false);
    });
  }
});
