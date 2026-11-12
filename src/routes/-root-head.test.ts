import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { ICON_LINKS } from "#/lib/icon-links";

describe("ícones do head", () => {
  test("declara favicon SVG, PNG 32x32 e apple-touch-icon", () => {
    expect(ICON_LINKS).toContainEqual({ rel: "icon", type: "image/svg+xml", href: "/favicon.svg" });
    expect(ICON_LINKS).toContainEqual({
      rel: "icon",
      type: "image/png",
      sizes: "32x32",
      href: "/favicon-32.png",
    });
    expect(ICON_LINKS).toContainEqual({
      rel: "apple-touch-icon",
      sizes: "180x180",
      href: "/apple-touch-icon.png",
    });
  });

  test("os arquivos existem em public/", () => {
    for (const l of ICON_LINKS) expect(existsSync(`public${l.href}`)).toBe(true);
  });

  test("o root usa ICON_LINKS no head", () => {
    expect(readFileSync("src/routes/__root.tsx", "utf8")).toContain("...ICON_LINKS");
  });
});
