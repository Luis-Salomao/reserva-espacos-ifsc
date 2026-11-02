import type { XmlNode } from "./read.ts";
import type { ImportWarning, WarningCode } from "./warnings.ts";

export type Warn = (code: WarningCode, ref?: string, detail?: string) => void;

const TIME = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;
const MASK = /^[01]+$/;
const INTEGER = /^\d+$/;

/** Valor do atributo sem espaços nas pontas; `undefined` se ausente ou vazio. */
export function attr(node: XmlNode, name: string): string | undefined {
  const value = node.attrs[name.toLowerCase()]?.trim();
  return value === undefined || value === "" ? undefined : value;
}

export function text(node: XmlNode, name: string): string {
  return attr(node, name) ?? "";
}

/** "A, B,A" -> ["A", "B"]: sem vazios e sem repetidos (primeira ocorrência vence). */
export function idList(value: string | undefined): string[] {
  if (value === undefined) return [];
  const parts = value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "");
  return [...new Set(parts)];
}

/** "8:00" -> "08:00", "08:00:00" -> "08:00" (segundos descartados); `null` se inválido. */
export function parseTime(value: string | undefined): string | null {
  const match = value === undefined ? null : TIME.exec(value);
  if (match === null) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = match[3] === undefined ? 0 : Number(match[3]);
  if (hours > 23 || minutes > 59 || seconds > 59) return null;
  return `${String(hours).padStart(2, "0")}:${match[2]}`;
}

/** Inteiro não negativo; `null` se ausente ou inválido. */
export function parseInteger(value: string | undefined): number | null {
  if (value === undefined || !INTEGER.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

/** Máscaras 0/1 separadas por vírgula; descarta as inválidas e avisa. */
export function parseMasks(value: string | undefined, warn: Warn, ref: string): string[] {
  const parts = idList(value);
  const valid = parts.filter((part) => MASK.test(part));
  if (valid.length !== parts.length) warn("invalid_mask", ref);
  return valid;
}

export function singleMask(value: string | undefined, warn: Warn, ref: string): string | null {
  if (value === undefined) return null;
  const masks = parseMasks(value, warn, ref);
  return masks.length > 0 ? masks.join(",") : null;
}

type Entry<T> = { key: string; value: T };

type SectionSpec<T> = {
  section: string;
  item: string;
  /** Atributo que identifica o item; `null` quando não há identificador. */
  keyAttr: string | null;
  build: (node: XmlNode, key: string, warn: Warn) => T | null;
};

/**
 * Lê `<section><item/>...</section>` filho direto da raiz. Avisa `section_missing`
 * quando o contêiner não existe; ignora filhos desconhecidos; o primeiro id vence.
 */
export function readSection<T>(
  root: XmlNode,
  spec: SectionSpec<T>,
  warnings: ImportWarning[],
): Entry<T>[] {
  const containers = root.children.filter((child) => child.name === spec.section);
  const container = containers[0];
  if (container === undefined) {
    warnings.push({ code: "section_missing", section: spec.section });
    return [];
  }
  if (containers.length > 1) warnings.push({ code: "section_repeated", section: spec.section });
  const warn: Warn = (code, ref, detail) => {
    const warning: ImportWarning = { code, section: spec.section };
    if (ref !== undefined) warning.ref = ref;
    if (detail !== undefined) warning.detail = detail;
    warnings.push(warning);
  };
  const seen = new Set<string>();
  const entries: Entry<T>[] = [];
  for (const node of container.children) {
    if (node.name !== spec.item) continue;
    const key = spec.keyAttr === null ? "" : attr(node, spec.keyAttr);
    if (key === undefined) {
      warn("missing_attribute", undefined, spec.keyAttr ?? undefined);
      continue;
    }
    if (spec.keyAttr !== null && seen.has(key)) {
      warn("duplicate_id", key);
      continue;
    }
    seen.add(key);
    const value = spec.build(node, key, warn);
    if (value !== null) entries.push({ key, value });
  }
  return entries;
}
