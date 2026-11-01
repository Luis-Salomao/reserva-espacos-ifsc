import { describe, expect, spyOn, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MAX_XML_BYTES } from "#/import-asc/read.ts";
import { handlePreviewRequest, type PreviewImportResult } from "./import-preview.ts";

const FIXTURE = join(import.meta.dir, "../../test/fixtures/asc/complete.xml");

/** O `Request` do runtime de testes descarta `Content-Length`; por isso a requisição é montada à mão. */
function post(body: string): Request {
  const length = new TextEncoder().encode(body).length;
  return {
    headers: new Headers({ "content-length": String(length) }),
    body: length === 0 ? null : new Response(body).body,
  } as unknown as Request;
}

async function run(request: Request): Promise<{ status: number; json: PreviewImportResult }> {
  const response = await handlePreviewRequest(request);
  return { status: response.status, json: (await response.json()) as PreviewImportResult };
}

/** Requisição falsa: só cabeçalhos e corpo, para simular o que o `Request` real não permite. */
function fake(contentLength: string, body: ReadableStream<Uint8Array> | null): Request {
  return { headers: new Headers({ "content-length": contentLength }), body } as unknown as Request;
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
      headers: new Headers({ "content-length": String(MAX_XML_BYTES + 1) }),
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
    const request = { headers: new Headers(), body: null } as unknown as Request;
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
      headers: new Headers({ "content-length": "5" }),
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
});
