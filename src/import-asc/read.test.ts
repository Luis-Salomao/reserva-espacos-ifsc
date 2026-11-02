import { describe, expect, test } from "bun:test";
import { MAX_XML_BYTES, readAscXml } from "./read.ts";

const enc = new TextEncoder();

function utf16le(text: string): Uint8Array {
  const out = new Uint8Array(2 + text.length * 2);
  out[0] = 0xff;
  out[1] = 0xfe;
  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i);
    out[2 + i * 2] = unit & 0xff;
    out[3 + i * 2] = unit >> 8;
  }
  return out;
}

function failure(bytes: Uint8Array) {
  const result = readAscXml(bytes);
  if (result.ok) throw new Error("esperava rejeição");
  return result.error;
}

describe("readAscXml", () => {
  test("rejeita arquivo maior que 10 MB", () => {
    const error = failure(new Uint8Array(MAX_XML_BYTES + 1));
    expect(error.code).toBe("too_large");
  });

  test("rejeita DOCTYPE/ENTITY sem vazar conteúdo", () => {
    const xml = '<!DOCTYPE timetable [<!ENTITY x SYSTEM "file:///etc/passwd">]><timetable/>';
    const error = failure(enc.encode(xml));
    expect(error.code).toBe("dtd_forbidden");
    expect(error.message).not.toContain("passwd");
  });

  test("rejeita ENTITY isolado, em qualquer caixa", () => {
    expect(failure(enc.encode("<timetable><!entity x 'y'></timetable>")).code).toBe(
      "dtd_forbidden",
    );
  });

  test("declaração XML não conta como DOCTYPE", () => {
    const xml =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><timetable importtype="x"/>';
    expect(readAscXml(enc.encode(xml)).ok).toBe(true);
  });

  test("rejeita XML malformado", () => {
    expect(failure(enc.encode("<timetable><a></timetable>")).code).toBe("malformed");
  });

  test("rejeita texto vazio ou sem elemento", () => {
    expect(failure(enc.encode("")).code).toBe("malformed");
    expect(failure(enc.encode("não é xml")).code).toBe("malformed");
  });

  test("rejeita raiz diferente de timetable", () => {
    expect(failure(enc.encode("<foo/>")).code).toBe("not_timetable");
  });

  test("lê UTF-8 com BOM", () => {
    const body = enc.encode("<timetable/>");
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...body]);
    const result = readAscXml(bytes);
    expect(result.ok && result.root.name).toBe("timetable");
  });

  test("lê UTF-16LE com BOM", () => {
    const result = readAscXml(utf16le('<?xml version="1.0"?><timetable name="Aç"/>'));
    expect(result.ok && result.root.name).toBe("timetable");
    expect(result.ok && result.root.attrs.name).toBe("Aç");
  });

  test("lê UTF-16BE com BOM", () => {
    const le = utf16le("<timetable/>");
    const be = new Uint8Array(le.length);
    be[0] = 0xfe;
    be[1] = 0xff;
    for (let i = 2; i < le.length; i += 2) {
      be[i] = le[i + 1] ?? 0;
      be[i + 1] = le[i] ?? 0;
    }
    expect(readAscXml(be).ok).toBe(true);
  });

  test("rejeita bytes inválidos em UTF-8 sem BOM (Windows-1252)", () => {
    const bytes = new Uint8Array([...enc.encode("<timetable a='"), 0xe9, ...enc.encode("'/>")]);
    expect(failure(bytes).code).toBe("unsupported_encoding");
  });

  test("atributos viram minúsculos e permanecem strings", () => {
    const result = readAscXml(enc.encode('<timetable Name="X" Code="007" Flag="true"/>'));
    if (!result.ok) throw new Error("falhou");
    expect(result.root.attrs.name).toBe("X");
    expect(result.root.attrs.code).toBe("007");
    expect(result.root.attrs.flag).toBe("true");
  });

  test("constrói árvore com nomes em minúsculas, ignorando texto", () => {
    const xml =
      "<TimeTable>\n  <Periods><Period period='1'/><Period period='2'/></Periods>\n  <cards/>texto</TimeTable>";
    const result = readAscXml(enc.encode(xml));
    if (!result.ok) throw new Error("falhou");
    expect(result.root.name).toBe("timetable");
    expect(result.root.children.map((c) => c.name)).toEqual(["periods", "cards"]);
    expect(result.root.children[0]?.children.map((c) => c.attrs.period)).toEqual(["1", "2"]);
  });

  test("decodifica entidades predefinidas e referências numéricas em uma só passagem", () => {
    const xml =
      '<timetable a="A &amp; B" b="&#233;" c="&#xE9;" d="&amp;lt;" e="&foo;" f="&#0;" g="&#xD800;" h="&#1114112;" i="&lt;&gt;&quot;&apos;"/>';
    const result = readAscXml(enc.encode(xml));
    if (!result.ok) throw new Error("falhou");
    const a = result.root.attrs;
    expect(a.a).toBe("A & B");
    expect(a.b).toBe("é");
    expect(a.c).toBe("é");
    expect(a.d).toBe("&lt;");
    expect(a.e).toBe("&foo;");
    expect(a.f).toBe("&#0;");
    expect(a.g).toBe("&#xD800;");
    expect(a.h).toBe("&#1114112;");
    expect(a.i).toBe("<>\"'");
  });

  test("rejeita aninhamento acima do limite de profundidade", () => {
    const deep = enc.encode(`<timetable>${"<a>".repeat(64)}${"</a>".repeat(64)}</timetable>`);
    expect(failure(deep).code).toBe("malformed");
    const ok = enc.encode(`<timetable>${"<a>".repeat(63)}${"</a>".repeat(63)}</timetable>`);
    expect(readAscXml(ok).ok).toBe(true);
  });
});

describe("espaço antes da declaração XML", () => {
  test("remove espaços e quebras de linha antes de <?xml", () => {
    const result = readAscXml(enc.encode('\n  \r\n<?xml version="1.0"?><timetable/>'));
    expect(result.ok).toBe(true);
  });
});
