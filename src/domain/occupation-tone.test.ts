import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { legendEntryOf, TINT_PERCENT, tint } from "./occupation-tone";
import { contrastRatio, RESERVA_TONE, SUBJECT_PALETTE } from "./overview";

const css = readFileSync(join(import.meta.dir, "../styles/tokens.css"), "utf8");
const toneStyleSource = readFileSync(join(import.meta.dir, "../lib/tone-style.ts"), "utf8");

function token(block: string, name: string): string {
  const body = css.slice(css.indexOf(block));
  const match = body.match(new RegExp(`${name}: *(#[0-9a-fA-F]{6})`));
  return (match?.[1] ?? "").toLowerCase();
}

const THEMES = [
  { name: "claro", key: "light", block: ":root {", percent: TINT_PERCENT.light },
  { name: "escuro", key: "dark", block: ':root[data-theme="dark"]', percent: TINT_PERCENT.dark },
] as const;

/** Distância de cor CIE76 entre dois `#rrggbb`. */
function deltaE(a: string, b: string): number {
  const lab = (hex: string) => {
    const lin = [1, 3, 5].map((i) => {
      const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    const x = 0.4124 * lin[0] + 0.3576 * lin[1] + 0.1805 * lin[2];
    const y = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
    const z = 0.0193 * lin[0] + 0.1192 * lin[1] + 0.9505 * lin[2];
    const f = (t: number) => (t > 0.008856 ? t ** (1 / 3) : 7.787 * t + 16 / 116);
    const [fx, fy, fz] = [f(x / 0.95047), f(y), f(z / 1.08883)] as [number, number, number];
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)] as const;
  };
  const [p, q] = [lab(a), lab(b)];
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

describe.each(THEMES)("cartões de disciplina no tema $name", ({ key, block, percent }) => {
  const bg = token(block, "--bg");
  const text = token(block, "--text");
  const muted = token(block, "--text-muted");

  test("texto e texto secundário >= 4.5 sobre o fundo suave de toda a paleta", () => {
    for (const tone of [...SUBJECT_PALETTE, RESERVA_TONE]) {
      const card = tint(tone[key], bg, percent);
      expect(contrastRatio(text, card)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(muted, card)).toBeGreaterThanOrEqual(4.5);
    }
  });

  test("nenhuma cor da paleta se confunde com o vermelho de conflito nem com o verde de livre", () => {
    const conflict = token(block, "--line-conflict");
    const free = token(block, "--line-free");
    for (const tone of SUBJECT_PALETTE) {
      expect(deltaE(tone[key], conflict)).toBeGreaterThanOrEqual(25);
      expect(deltaE(tone[key], free)).toBeGreaterThanOrEqual(25);
    }
  });
});

test("as classes de CSS usam as mesmas porcentagens de mistura testadas", () => {
  expect(toneStyleSource).toContain(`var(--tone-light)_${TINT_PERCENT.light}%`);
  expect(toneStyleSource).toContain(`var(--tone-dark)_${TINT_PERCENT.dark}%`);
});

describe("legendEntryOf", () => {
  test("aula importada usa a cor da disciplina; a mesma matéria, a mesma cor", () => {
    const a = legendEntryOf({ source: "import", title: "ALG — T1A" });
    const b = legendEntryOf({ source: "import", title: "ALG — T2B" });
    expect(a.tone).toEqual(b.tone);
    expect(a.key).toBe("materia:ALG");
  });
  test("reserva manual comum fica na cor neutra", () => {
    expect(legendEntryOf({ source: "manual", title: "Reunião" }).tone).toEqual(RESERVA_TONE);
  });
});
