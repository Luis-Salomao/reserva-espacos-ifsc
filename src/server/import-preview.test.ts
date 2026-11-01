import { describe, expect, spyOn, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MAX_XML_BYTES } from "#/import-asc/read.ts";
import { parseUploadInput, previewHandler, runPreviewImport } from "./import-preview.ts";

const FIXTURE = join(import.meta.dir, "../../test/fixtures/asc/complete.xml");

function form(file: File | string | null): FormData {
  const data = new FormData();
  if (file !== null) data.set("file", file);
  return data;
}

describe("runPreviewImport", () => {
  test("devolve a prévia para o XML da fixture", async () => {
    const file = new File([readFileSync(FIXTURE)], "horarios.xml", { type: "text/xml" });
    const result = await runPreviewImport(form(file));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.preview.counts.lessons).toBe(2);
      expect(Object.keys(result.preview)).not.toContain("timetable");
    }
  });

  test("arquivo que não é XML dá mensagem amigável, sem stack", async () => {
    const result = await runPreviewImport(form(new File(["isto não é xml"], "a.xml")));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toBe("O arquivo não é um XML válido.");
      expect(result.message).not.toContain("at ");
    }
  });

  test("sem arquivo ou com campo de texto pede para selecionar", async () => {
    for (const data of [form(null), form("texto"), form(new File([], "vazio.xml"))]) {
      const result = await runPreviewImport(data);
      expect(result).toEqual({ ok: false, message: "Selecione um arquivo XML para importar." });
    }
  });

  test("recusa arquivo maior que 10 MB sem lê-lo", async () => {
    const file = new File([], "grande.xml");
    Object.defineProperty(file, "size", { value: MAX_XML_BYTES + 1 });
    const spy = spyOn(file, "arrayBuffer");
    const result = await runPreviewImport(form(file));
    expect(result).toEqual({ ok: false, message: "O arquivo é maior que o limite de 10 MB." });
    expect(spy).not.toHaveBeenCalled();
  });

  test("falha inesperada vira mensagem genérica e loga só o nome do erro", async () => {
    const file = new File(["<timetable/>"], "a.xml");
    spyOn(file, "arrayBuffer").mockRejectedValue(new TypeError("conteúdo secreto"));
    const log = spyOn(console, "error").mockImplementation(() => {});
    try {
      const result = await runPreviewImport(form(file));
      expect(result.ok).toBe(false);
      expect(JSON.stringify(result)).not.toContain("secreto");
      expect(log).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(log.mock.calls)).not.toContain("secreto");
      expect(log.mock.calls[0]?.[1]).toBe("TypeError");
    } finally {
      log.mockRestore();
    }
  });
});

describe("server fn", () => {
  test("validador aceita FormData e recusa qualquer outra coisa", () => {
    const data = new FormData();
    expect(parseUploadInput(data)).toBe(data);
    expect(() => parseUploadInput({ file: "x" })).toThrow("Envio inválido.");
  });

  test("handler delega para a leitura do arquivo", async () => {
    expect(await previewHandler({ data: new FormData() })).toEqual({
      ok: false,
      message: "Selecione um arquivo XML para importar.",
    });
  });
});
