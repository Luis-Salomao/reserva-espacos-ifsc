import { describe, expect, spyOn, test } from "bun:test";
import { join } from "node:path";
import { runImportPreview } from "./import-preview.ts";

const FIXTURE = join(import.meta.dir, "../test/fixtures/asc/complete.xml");

describe("runImportPreview", () => {
  test("--full sem --json é erro de uso", () => {
    const error = spyOn(console, "error").mockImplementation(() => {});
    expect(runImportPreview([FIXTURE, "--full"])).toBe(1);
    expect(error.mock.calls.join("")).toContain("--json");
    error.mockRestore();
  });

  test("--json --full funciona e imprime JSON", () => {
    const log = spyOn(console, "log").mockImplementation(() => {});
    expect(runImportPreview([FIXTURE, "--json", "--full"])).toBe(0);
    const printed = String(log.mock.calls[0]?.[0]);
    expect(JSON.parse(printed).timetable).toBeDefined();
    log.mockRestore();
  });
});
