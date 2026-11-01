import { describe, expect, test } from "bun:test";
import { normalizeAsc } from "./normalize.ts";
import { readAscXml } from "./read.ts";
import { describeWarning, type ImportWarning } from "./warnings.ts";

async function load(name: string) {
  const bytes = new Uint8Array(await Bun.file(`test/fixtures/asc/${name}`).arrayBuffer());
  const read = readAscXml(bytes);
  if (!read.ok) throw new Error("fixture inválida");
  return normalizeAsc(read.root);
}

function inline(xml: string) {
  const read = readAscXml(new TextEncoder().encode(xml));
  if (!read.ok) throw new Error("xml inválido");
  return normalizeAsc(read.root);
}

function codes(warnings: ImportWarning[]) {
  return warnings.map((w) => `${w.code}:${w.section}`);
}

describe("normalizeAsc com complete.xml", () => {
  test("produz as contagens da fixture sem avisos", async () => {
    const { timetable, warnings } = await load("complete.xml");
    expect(warnings).toEqual([]);
    expect(timetable.periods).toHaveLength(3);
    expect(timetable.days).toHaveLength(2);
    expect(timetable.weeks).toHaveLength(1);
    expect(timetable.terms).toHaveLength(2);
    expect(timetable.classrooms).toHaveLength(2);
    expect(timetable.teachers).toHaveLength(2);
    expect(timetable.subjects).toHaveLength(2);
    expect(timetable.classes).toHaveLength(2);
    expect(timetable.lessons).toHaveLength(2);
    expect(timetable.cards).toHaveLength(2);
  });

  test("docente tem somente id e short", async () => {
    const { timetable } = await load("complete.xml");
    for (const teacher of timetable.teachers) {
      expect(Object.keys(teacher).sort()).toEqual(["id", "short"]);
    }
  });

  test("nenhum dado pessoal aparece na saída serializada", async () => {
    const { timetable, warnings } = await load("complete.xml");
    const json = JSON.stringify({ timetable, warnings });
    for (const secret of [
      "Fulano",
      "Testador",
      "Beltrana",
      "exemplo.invalid",
      "48999990000",
      "48988880000",
      "#FF0000",
      "ALUNO-SECRETO",
      "Aluno Sintético",
      "gender",
    ]) {
      expect(json).not.toContain(secret);
    }
  });

  test("capacidade '*' vira null e '30' vira 30", async () => {
    const { timetable } = await load("complete.xml");
    expect(timetable.classrooms.map((c) => c.capacity)).toEqual([30, null]);
  });

  test("horário '8:00' vira '08:00'", async () => {
    const { timetable } = await load("complete.xml");
    expect(timetable.periods[0]).toEqual({
      number: 1,
      name: "1",
      short: "1",
      start: "08:00",
      end: "08:50",
    });
  });

  test("máscaras em lista são separadas", async () => {
    const { timetable } = await load("complete.xml");
    expect(timetable.days[1]?.masks).toEqual(["10000", "00100"]);
    expect(timetable.terms[1]?.masks).toEqual(["1110", "0111"]);
  });

  test("lessons e cards trazem listas de ids e campos", async () => {
    const { timetable } = await load("complete.xml");
    expect(timetable.lessons[1]).toEqual({
      id: "L2",
      subjectId: "S2",
      classIds: ["C1", "C2"],
      teacherIds: ["P1", "P2"],
      classroomIds: ["R1", "R2"],
      periodsPerCard: 1,
      termsDefId: "T2",
      weeksDefId: "W1",
      daysDefId: "D2",
    });
    expect(timetable.cards[1]).toEqual({
      lessonId: "L2",
      period: 3,
      days: "00100",
      weeks: "1",
      terms: "1110",
      classroomIds: ["R1", "R2"],
    });
  });
});

describe("normalizeAsc com minimal.xml", () => {
  test("listas vazias e um section_missing por seção", async () => {
    const { timetable, warnings } = await load("minimal.xml");
    for (const list of Object.values(timetable)) expect(list).toEqual([]);
    expect(warnings.every((w) => w.code === "section_missing")).toBe(true);
    expect(warnings.map((w) => w.section).sort()).toEqual(
      [
        "cards",
        "classes",
        "classrooms",
        "daysdefs",
        "lessons",
        "periods",
        "subjects",
        "teachers",
        "termsdefs",
        "weeksdefs",
      ].sort(),
    );
  });

  test("seção presente porém vazia não gera aviso", () => {
    const { warnings } = inline("<timetable><cards/></timetable>");
    expect(warnings.some((w) => w.section === "cards")).toBe(false);
  });

  test("describeWarning devolve texto em pt-BR com a seção", () => {
    expect(describeWarning({ code: "section_missing", section: "cards" })).toBe(
      "cards: A seção não existe no arquivo.",
    );
  });
});

describe("normalizeAsc com messy-attrs.xml", () => {
  test("lê atributos em maiúsculas e ignora elementos desconhecidos", async () => {
    const { timetable } = await load("messy-attrs.xml");
    expect(timetable.classrooms.map((c) => c.id)).toEqual(["R1", "R2"]);
    expect(timetable.classrooms[0]?.short).toBe("S");
  });

  test("horário inválido omite o período", async () => {
    const { timetable, warnings } = await load("messy-attrs.xml");
    expect(timetable.periods.map((p) => p.number)).toEqual([1, 4]);
    expect(warnings).toContainEqual({ code: "invalid_time", section: "periods", ref: "2" });
    expect(warnings).toContainEqual({ code: "invalid_number", section: "periods", ref: "x" });
  });

  test("ids com espaços e vírgulas extras são normalizados", async () => {
    const { timetable } = await load("messy-attrs.xml");
    const lesson = timetable.lessons[0];
    expect(lesson?.classIds).toEqual(["A", "B"]);
    expect(lesson?.classroomIds).toEqual(["R1", "R2"]);
    expect(lesson?.subjectId).toBeNull();
  });

  test("periodspercard inválido ou ausente vira 1 com aviso", async () => {
    const { timetable, warnings } = await load("messy-attrs.xml");
    expect(timetable.lessons.map((l) => l.periodsPerCard)).toEqual([1, 1]);
    const invalid = warnings.filter((w) => w.code === "invalid_number" && w.section === "lessons");
    expect(invalid.map((w) => w.ref)).toEqual(["L1", "L2"]);
  });

  test("id duplicado mantém o primeiro", async () => {
    const { timetable, warnings } = await load("messy-attrs.xml");
    expect(timetable.classrooms.filter((c) => c.id === "R1")).toHaveLength(1);
    expect(timetable.classrooms[0]?.name).toBe("Sala");
    expect(warnings).toContainEqual({ code: "duplicate_id", section: "classrooms", ref: "R1" });
  });

  test("item sem id é ignorado com missing_attribute", async () => {
    const { warnings } = await load("messy-attrs.xml");
    expect(codes(warnings)).toContain("missing_attribute:classrooms");
    expect(codes(warnings)).toContain("missing_attribute:cards");
  });

  test("máscaras inválidas são descartadas com aviso", async () => {
    const { timetable, warnings } = await load("messy-attrs.xml");
    expect(timetable.days[0]?.masks).toEqual(["10000", "0101"]);
    expect(timetable.terms[0]?.masks).toEqual([]);
    expect(codes(warnings)).toContain("invalid_mask:daysdefs");
    expect(codes(warnings)).toContain("invalid_mask:termsdefs");
  });

  test("card de lesson inexistente gera unknown_reference e é descartado", async () => {
    const { timetable, warnings } = await load("messy-attrs.xml");
    expect(timetable.cards.map((c) => c.lessonId)).toEqual(["L1"]);
    expect(warnings).toContainEqual({
      code: "unknown_reference",
      section: "cards",
      ref: "GHOST",
      detail: "lessonid",
    });
  });

  test("máscara inválida em card vira null com aviso", () => {
    const { timetable, warnings } = inline(
      '<timetable><lessons><lesson id="L"/></lessons><cards><card lessonid="L" days="2x" period="z"/></cards></timetable>',
    );
    expect(timetable.cards[0]).toMatchObject({ days: null, period: null });
    expect(codes(warnings)).toContain("invalid_mask:cards");
    expect(codes(warnings)).toContain("invalid_number:cards");
  });

  test("capacidade inválida vira null com aviso", () => {
    const { timetable, warnings } = inline(
      '<timetable><classrooms><classroom id="R" capacity="muitas"/></classrooms></timetable>',
    );
    expect(timetable.classrooms[0]?.capacity).toBeNull();
    expect(codes(warnings)).toContain("invalid_number:classrooms");
  });
});
