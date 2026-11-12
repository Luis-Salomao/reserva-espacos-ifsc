import type { CSSProperties } from "react";
import type { Tone } from "#/domain/overview";

/** Cores claro/escuro em variáveis CSS, lidas pelas classes de `TONE`. */
export function toneStyle(tone: Tone): CSSProperties {
  return { "--tone-light": tone.light, "--tone-dark": tone.dark } as CSSProperties;
}

/** Textura complementar à cor: reduz a ambiguidade quando duas matérias caem no mesmo tom. */
export function patternStyle(pattern: number): CSSProperties {
  const patterns = [
    "repeating-linear-gradient(135deg, transparent 0 4px, rgb(255 255 255 / 55%) 4px 6px)",
    "repeating-linear-gradient(45deg, transparent 0 4px, rgb(255 255 255 / 55%) 4px 6px)",
    "repeating-linear-gradient(0deg, transparent 0 4px, rgb(255 255 255 / 55%) 4px 6px)",
    "repeating-linear-gradient(90deg, transparent 0 4px, rgb(255 255 255 / 55%) 4px 6px)",
  ];
  return { backgroundImage: patterns[pattern % patterns.length] };
}

/**
 * Classes que usam as variáveis de `toneStyle`. `tint` é o fundo suave do cartão (14% da cor no
 * claro, 16% no escuro, sobre o fundo do tema; ver `TINT_PERCENT`); `solid` é a cor cheia, para
 * barras, quadradinhos e legendas.
 */
export const TONE = {
  solid: "bg-[var(--tone-light)] dark:bg-[var(--tone-dark)]",
  tint: "bg-[color-mix(in_srgb,var(--tone-light)_14%,var(--bg))] dark:bg-[color-mix(in_srgb,var(--tone-dark)_16%,var(--bg))]",
} as const;
