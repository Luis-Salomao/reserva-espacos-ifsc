import { XMLParser, XMLValidator } from "fast-xml-parser";
import { type ImportRejection, rejection } from "./errors.ts";

export const MAX_XML_BYTES = 10 * 1024 * 1024;

type XmlNode = { name: string; attrs: Record<string, string>; children: XmlNode[] };

export type ReadResult = { ok: true; root: XmlNode } | { ok: false; error: ImportRejection };

const ATTRS_KEY = ":@";
const FORBIDDEN_DECLARATION = /<!\s*(doctype|entity)/i;

function fail(code: Parameters<typeof rejection>[0]): ReadResult {
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

function toNodes(items: unknown): XmlNode[] {
  if (!Array.isArray(items)) return [];
  const nodes: XmlNode[] = [];
  for (const item of items) {
    if (typeof item !== "object" || item === null) continue;
    const record = item as Record<string, unknown>;
    const tag = Object.keys(record).find((key) => key !== ATTRS_KEY);
    if (tag === undefined || tag.startsWith("#") || tag.startsWith("?")) continue;
    const attrs: Record<string, string> = {};
    const rawAttrs = record[ATTRS_KEY];
    if (typeof rawAttrs === "object" && rawAttrs !== null) {
      for (const [key, value] of Object.entries(rawAttrs)) {
        attrs[key.toLowerCase()] = String(value);
      }
    }
    nodes.push({ name: tag.toLowerCase(), attrs, children: toNodes(record[tag]) });
  }
  return nodes;
}

export function readAscXml(bytes: Uint8Array): ReadResult {
  if (bytes.byteLength > MAX_XML_BYTES) return fail("too_large");
  const text = decode(bytes);
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

  const root = toNodes(parsed)[0];
  if (root === undefined) return fail("malformed");
  if (root.name !== "timetable") return fail("not_timetable");
  return { ok: true, root };
}
