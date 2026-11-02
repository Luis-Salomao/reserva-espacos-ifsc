import { describe, expect, test } from "bun:test";
import { BUSY_MESSAGE, classifyImportConflict, STALE_MESSAGE } from "./import-conflicts";

describe("conflitos tipados da importação", () => {
  test("reconhece lote em andamento e preparo defasado", () => {
    expect(classifyImportConflict(BUSY_MESSAGE)).toBe("busy");
    expect(classifyImportConflict(STALE_MESSAGE)).toBe("stale");
  });

  test("outras mensagens não são conflitos tipados", () => {
    expect(classifyImportConflict("O lote foi alterado por outra operação.")).toBeNull();
    expect(classifyImportConflict("")).toBeNull();
  });
});
