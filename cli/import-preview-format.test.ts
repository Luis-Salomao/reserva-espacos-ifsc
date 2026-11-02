import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { previewAscXml } from "#/import-asc/index.ts";
import { formatPreviewText, previewForJson } from "./import-preview-format.ts";

function load(name: string) {
  const bytes = new Uint8Array(readFileSync(join(import.meta.dir, "../test/fixtures/asc", name)));
  const result = previewAscXml(bytes);
  if (!result.ok) throw new Error("rejeitado");
  return result.preview;
}

describe("formatPreviewText", () => {
  test("resume contagens, status, sobreposições, durações, avisos e salas", () => {
    const text = formatPreviewText(load("complete.xml"));
    expect(text).toContain("Prévia da importação");
    expect(text).toContain("Cards: 2");
    expect(text).toContain("Horários semanais:");
    expect(text).toContain("Sobreposições na mesma sala");
    expect(text).toContain("Durações usadas");
    expect(text).toContain("Salas (nº de horários)");
    expect(text).toContain("LAB: 1");
  });

  test("lista avisos agrupados com exemplos", () => {
    const text = formatPreviewText(load("minimal.xml"));
    expect(text).toMatch(/\d+x \[arquivo\/\w+\] A seção não existe/);
    const grade = formatPreviewText(load("lessons-without-cards.xml"));
    expect(grade).toMatch(/\[grade\/lessons\] Aula sem nenhum card/);
  });

  test("mostra sobreposições quando existem", () => {
    const preview = load("complete.xml");
    const text = formatPreviewText({ ...preview, overlaps: { certain: 2, possible: 1 } });
    expect(text).toContain("Certas: 2");
    expect(text).toContain("Possíveis: 1");
  });

  test("seções vazias dizem Nenhum/Nenhuma", () => {
    const preview = load("complete.xml");
    const text = formatPreviewText({
      ...preview,
      warnings: [],
      termsUsed: [],
      classrooms: [],
      overlaps: { certain: 0, possible: 0 },
    });
    expect(text).toContain("Nenhum\n");
    expect(text).toContain("  Nenhuma\n");
    expect(text).not.toContain("Certas:");
  });
});

describe("previewForJson", () => {
  test("omite a grade completa por padrão", () => {
    const json = previewForJson(load("complete.xml"), false) as Record<string, unknown>;
    expect(json.counts).toBeDefined();
    expect("timetable" in json).toBe(false);
    expect("slots" in json).toBe(false);
    expect("overlapsDetail" in json).toBe(false);
  });

  test("--full mantém tudo", () => {
    const json = previewForJson(load("complete.xml"), true) as Record<string, unknown>;
    expect(json.timetable).toBeDefined();
    expect(json.slots).toBeDefined();
    expect(json.overlapsDetail).toBeDefined();
  });
});

describe("avisos de truncamento e prévia parcial", () => {
  test("informa 'mostrando N de M' quando o detalhe foi truncado", () => {
    const preview = load("complete.xml");
    const text = formatPreviewText({
      ...preview,
      overlaps: { certain: 900, possible: 100 },
      overlapsTruncated: true,
    });
    expect(text).toContain(`Mostrando ${preview.overlapsDetail.length} de 1000`);
  });

  test("avisa quando a prévia é parcial", () => {
    expect(formatPreviewText({ ...load("complete.xml"), partial: true })).toContain(
      "prévia parcial",
    );
    expect(formatPreviewText(load("complete.xml"))).not.toContain("parcial");
  });
});
