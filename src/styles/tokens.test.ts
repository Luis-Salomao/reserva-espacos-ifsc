import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const css = readFileSync(join(import.meta.dir, "tokens.css"), "utf8");

type Tokens = Record<string, string>;

function parseDeclarations(body: string): Tokens {
  const tokens: Tokens = {};
  for (const match of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    const [, name, value] = match;
    if (name && value) tokens[name] = value.trim();
  }
  return tokens;
}

/** Extrai o corpo do bloco cujo seletor começa em `selector` (chaves balanceadas). */
function blockBody(source: string, selector: string): string {
  const start = source.indexOf(selector);
  if (start < 0) throw new Error(`Seletor não encontrado: ${selector}`);
  const open = source.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    if (source[i] === "}") depth--;
    if (depth === 0) return source.slice(open + 1, i);
  }
  throw new Error(`Bloco não fechado: ${selector}`);
}

const light = parseDeclarations(blockBody(css, ":root {"));
const dark = parseDeclarations(blockBody(css, ':root[data-theme="dark"]'));
const darkMedia = parseDeclarations(
  blockBody(blockBody(css, "@media (prefers-color-scheme: dark)"), ":root:not([data-theme"),
);

function luminance(hex: string): number {
  const value = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => {
    const channel = Number.parseInt(value.slice(i, i + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const REQUIRED = [
  "--bg",
  "--surface",
  "--surface-2",
  "--border",
  "--divider",
  "--text",
  "--text-muted",
  "--accent",
  "--accent-contrast",
  "--accent-text",
  "--occ-free",
  "--occ-booked",
  "--occ-imported",
  "--occ-conflict",
  "--focus",
  "--line-free",
  "--line-booked",
  "--line-imported",
  "--line-conflict",
  "--warn",
  "--warn-text",
  "--brand-red",
];
const LINES = ["--line-free", "--line-booked", "--line-imported", "--line-conflict"];
const OCCUPANCY = ["--occ-free", "--occ-booked", "--occ-imported", "--occ-conflict"];

const themes: [string, Tokens][] = [
  ["claro", light],
  ["escuro", dark],
  ["escuro (prefers-color-scheme)", darkMedia],
];

describe.each(themes)("tokens do tema %s", (_name, t) => {
  test("define todos os tokens como cores hex", () => {
    for (const key of REQUIRED) expect(t[key]).toMatch(/^#[0-9a-f]{6}$/i);
  });

  test("texto e texto secundário sobre o fundo >= 4.5", () => {
    expect(contrast(t["--text"] as string, t["--bg"] as string)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(t["--text-muted"] as string, t["--bg"] as string)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(t["--text-muted"] as string, t["--surface"] as string)).toBeGreaterThanOrEqual(
      4.5,
    );
    expect(
      contrast(t["--text-muted"] as string, t["--surface-2"] as string),
    ).toBeGreaterThanOrEqual(4.5);
  });

  test("o destaque é o verde oficial do IFSC (Manual da Marca 2017, RGB 50 160 65)", () => {
    expect((t["--accent"] as string).toLowerCase()).toBe("#32a041");
  });

  test("texto sobre o destaque >= 4.5", () => {
    expect(
      contrast(t["--accent-contrast"] as string, t["--accent"] as string),
    ).toBeGreaterThanOrEqual(4.5);
  });

  test("texto de destaque (links) sobre fundo e superfícies >= 4.5", () => {
    for (const base of ["--bg", "--surface", "--surface-2"]) {
      expect(contrast(t["--accent-text"] as string, t[base] as string)).toBeGreaterThanOrEqual(4.5);
    }
  });

  test("foco visível contra o fundo >= 3", () => {
    expect(contrast(t["--focus"] as string, t["--bg"] as string)).toBeGreaterThanOrEqual(3);
    expect(contrast(t["--focus"] as string, t["--surface"] as string)).toBeGreaterThanOrEqual(3);
  });

  test.each(OCCUPANCY)("texto sobre %s >= 4.5", (token) => {
    expect(contrast(t["--text"] as string, t[token] as string)).toBeGreaterThanOrEqual(4.5);
  });

  test.each(LINES)("linha de estado %s sobre o fundo >= 3", (token) => {
    expect(contrast(t[token] as string, t["--bg"] as string)).toBeGreaterThanOrEqual(3);
    expect(contrast(t[token] as string, t["--surface"] as string)).toBeGreaterThanOrEqual(3);
  });

  test("texto de aviso (manutenção) sobre o fundo de aviso >= 4.5", () => {
    expect(contrast(t["--warn-text"] as string, t["--warn"] as string)).toBeGreaterThanOrEqual(4.5);
  });

  // Razões medidas: borda de controle 2.06 (claro) e 2.20 (escuro) sobre o fundo; divisor de grade 1.29 e 1.37.
  test("borda de controles (campos, botões outline, segmentos) perceptível: >= 2 sobre fundo e superfície", () => {
    expect(contrast(t["--border"] as string, t["--bg"] as string)).toBeGreaterThanOrEqual(2);
    expect(contrast(t["--border"] as string, t["--surface"] as string)).toBeGreaterThanOrEqual(1.9);
  });

  test("divisor de grades e tabelas é mais suave que a borda de controles, mas visível (>= 1.2)", () => {
    const divider = contrast(t["--divider"] as string, t["--bg"] as string);
    expect(divider).toBeGreaterThanOrEqual(1.2);
    expect(divider).toBeLessThan(contrast(t["--border"] as string, t["--bg"] as string));
  });

  test("estados de ocupação são todos distintos", () => {
    const values = OCCUPANCY.map((key) => (t[key] as string).toLowerCase());
    expect(new Set(values).size).toBe(values.length);
  });
});

test("tema escuro via atributo e via preferência do sistema são idênticos", () => {
  expect(darkMedia).toEqual(dark);
});

test("vermelho oficial do IFSC no tema claro (Manual da Marca 2017: #C8191E)", () => {
  expect((light["--brand-red"] as string).toLowerCase()).toBe("#c8191e");
});
