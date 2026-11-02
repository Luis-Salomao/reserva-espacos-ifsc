import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { THEME_SCRIPT } from "#/lib/theme-script";
import { applySecurityHeaders, buildCsp, hashInlineScript } from "./security-headers.ts";

const NONCE = "bm9uY2UtZGUtdGVzdGU=";

function directives(csp: string): Record<string, string[]> {
  return Object.fromEntries(
    csp.split("; ").map((directive) => {
      const [name = "", ...values] = directive.split(" ");
      return [name, values];
    }),
  );
}

describe("hashInlineScript", () => {
  test("SHA-256 em base64 do texto exato", () => {
    const expected = createHash("sha256").update("abc").digest("base64");
    expect(hashInlineScript("abc")).toBe(`'sha256-${expected}'`);
  });
});

describe("buildCsp", () => {
  const prod = buildCsp({ dev: false, themeScript: THEME_SCRIPT, nonce: NONCE });

  test("produção: self + nonce + hash do script de tema, sem unsafe-inline em script", () => {
    // O hash vem do mesmo texto que o __root injeta (THEME_SCRIPT).
    const hash = createHash("sha256").update(THEME_SCRIPT).digest("base64");
    const parsed = directives(prod);
    expect(parsed["script-src"]).toEqual(["'self'", `'nonce-${NONCE}'`, `'sha256-${hash}'`]);
    expect(parsed["default-src"]).toEqual(["'self'"]);
    expect(parsed["style-src"]).toEqual(["'self'", "'unsafe-inline'"]);
    expect(parsed["img-src"]).toEqual(["'self'", "data:"]);
    expect(parsed["connect-src"]).toEqual(["'self'"]);
    expect(parsed["frame-ancestors"]).toEqual(["'none'"]);
    expect(parsed["base-uri"]).toEqual(["'self'"]);
    expect(parsed["form-action"]).toEqual(["'self'"]);
    expect(prod).not.toContain("ws:");
    expect(prod).not.toContain("localhost");
    expect(prod).not.toContain("unsafe-eval");
  });

  test("desenvolvimento libera HMR do Vite, e só nele", () => {
    const dev = directives(buildCsp({ dev: true, themeScript: THEME_SCRIPT, nonce: NONCE }));
    expect(dev["script-src"]).toEqual(["'self'", "'unsafe-inline'"]);
    expect(dev["connect-src"]).toContain("ws://localhost:*");
    expect(dev["connect-src"]).toContain("ws://127.0.0.1:*");
    expect(directives(prod)["script-src"]).not.toContain("'unsafe-inline'");
  });
});

describe("applySecurityHeaders", () => {
  const options = { dev: false, themeScript: THEME_SCRIPT, nonce: NONCE };

  test("HTML recebe CSP (com o nonce), nosniff e Referrer-Policy", () => {
    const response = applySecurityHeaders(
      new Response("<html></html>", { headers: { "content-type": "text/html; charset=utf-8" } }),
      options,
    );
    expect(response.headers.get("content-security-policy")).toBe(buildCsp(options));
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("referrer-policy")).toBe("same-origin");
  });

  test("JSON e outros tipos recebem só os cabeçalhos leves", () => {
    const response = applySecurityHeaders(Response.json({ ok: true }), options);
    expect(response.headers.get("content-security-policy")).toBeNull();
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("referrer-policy")).toBe("same-origin");
  });

  test("preserva status, corpo e demais cabeçalhos", async () => {
    const original = new Response("corpo", {
      status: 303,
      headers: { location: "/", "x-extra": "1" },
    });
    const response = applySecurityHeaders(original, options);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/");
    expect(response.headers.get("x-extra")).toBe("1");
    expect(await response.text()).toBe("corpo");
  });

  test("usa a CSP de desenvolvimento quando dev", () => {
    const response = applySecurityHeaders(
      new Response("x", { headers: { "content-type": "text/html" } }),
      { ...options, dev: true },
    );
    expect(response.headers.get("content-security-policy")).toContain("ws://localhost:*");
  });
});
