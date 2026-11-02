import { XMLParser, XMLValidator } from "fast-xml-parser";
import { type ImportRejection, type ImportRejectionCode, rejection } from "./errors.ts";

export const MAX_XML_BYTES = 10 * 1024 * 1024;
const MAX_XML_DEPTH = 64;

const PREDEFINED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const REFERENCE = /&(?:#(\d+)|#x([0-9a-fA-F]+)|(amp|lt|gt|quot|apos));/g;

function decodeReferences(value: string): string {
  return value.replace(
    REFERENCE,
    (match, dec: string | undefined, hex: string | undefined, name: string | undefined) => {
      if (name !== undefined) return PREDEFINED[name] ?? match;
      const code = dec !== undefined ? Number.parseInt(dec, 10) : Number.parseInt(hex ?? "", 16);
      const surrogate = code >= 0xd800 && code <= 0xdfff;
      if (!Number.isInteger(code) || code === 0 || surrogate || code > 0x10ffff) return match;
      return String.fromCodePoint(code);
    },
  );
}

export type XmlNode = { name: string; attrs: Record<string, string>; children: XmlNode[] };

export type ReadResult = { ok: true; root: XmlNode } | { ok: false; error: ImportRejection };

const ATTRS_KEY = ":@";
const FORBIDDEN_DECLARATION = /<!\s*(doctype|entity)/i;

function fail(code: ImportRejectionCode): ReadResult {
  return { ok: false, error: rejection(code) };
}

function decode(bytes: Uint8Array): string | null {
  let label = "utf-8";
  if (bytes[0] === 0xff && bytes[1] === 0xfe) label = "utf-16le";
  else if (bytes[0] === 0xfe && bytes[1] === 0xff) label = "utf-16be";
  try {
    return new TextDecoder(label, { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function toNodes(items: unknown, depth: number): XmlNode[] | null {
  if (!Array.isArray(items)) return [];
  const nodes: XmlNode[] = [];
  for (const item of items) {
    if (typeof item !== "object" || item === null) continue;
    const record = item as Record<string, unknown>;
    const tag = Object.keys(record).find((key) => key !== ATTRS_KEY);
    if (tag === undefined || tag.startsWith("#") || tag.startsWith("?")) continue;
    if (depth > MAX_XML_DEPTH) return null;
    const attrs: Record<string, string> = {};
    const rawAttrs = record[ATTRS_KEY];
    if (typeof rawAttrs === "object" && rawAttrs !== null) {
      for (const [key, value] of Object.entries(rawAttrs)) {
        attrs[key.toLowerCase()] = decodeReferences(String(value));
      }
    }
    const children = toNodes(record[tag], depth + 1);
    if (children === null) return null;
    nodes.push({ name: tag.toLowerCase(), attrs, children });
  }
  return nodes;
}

export function readAscXml(bytes: Uint8Array): ReadResult {
  if (bytes.byteLength > MAX_XML_BYTES) return fail("too_large");
  const text = decode(bytes)?.trimStart() ?? null;
  if (text === null) return fail("unsupported_encoding");
  if (FORBIDDEN_DECLARATION.test(text)) return fail("dtd_forbidden");
  if (XMLValidator.validate(text) !== true) return fail("malformed");

  let parsed: unknown;
  try {
    parsed = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "",
      parseAttributeValue: false,
      parseTagValue: false,
      processEntities: false,
      preserveOrder: true,
    }).parse(text);
  } catch {
    return fail("malformed");
  }

  const root = toNodes(parsed, 1)?.[0];
  if (root === undefined) return fail("malformed");
  if (root.name !== "timetable") return fail("not_timetable");
  return { ok: true, root };
}
