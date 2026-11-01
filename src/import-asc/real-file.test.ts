import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { previewAscXml } from "./index.ts";

// Teste opcional: lê XMLs reais de data/real (fora do Git) e imprime só contagens.
const REAL_DIR = join(import.meta.dir, "../../data/real");
const files = existsSync(REAL_DIR)
  ? readdirSync(REAL_DIR).filter((name) => name.toLowerCase().endsWith(".xml"))
  : [];

describe("arquivo real de data/real", () => {
  if (files.length === 0) {
    test.skip("nenhum XML em data/real", () => {});
    return;
  }
  for (const name of files) {
    test(`prévia de ${name}`, () => {
      const result = previewAscXml(new Uint8Array(readFileSync(join(REAL_DIR, name))));
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const { counts, slotsByStatus, overlaps } = result.preview;
      expect(counts.cards).toBeGreaterThan(0);
      console.log(JSON.stringify({ counts, slotsByStatus, overlaps }));
    });
  }
});
