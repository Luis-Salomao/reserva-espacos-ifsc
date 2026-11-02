import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { previewAscXml } from "./index.ts";
import { normalizeAsc } from "./normalize.ts";
import { buildImportPreview } from "./preview.ts";
import { readAscXml } from "./read.ts";
import { buildWeeklySlots } from "./slots.ts";

const FIXTURES = join(import.meta.dir, "../../test/fixtures/asc");

function bytes(name: string): Uint8Array {
  return new Uint8Array(readFileSync(join(FIXTURES, name)));
}

function previewOf(name: string) {
  const result = previewAscXml(bytes(name));
  if (!result.ok) throw new Error("prévia rejeitada");
  return result.preview;
}

describe("previewAscXml com complete.xml", () => {
  const preview = previewOf("complete.xml");

  test("conta entidades e slots", () => {
    expect(preview.counts.cards).toBe(2);
    expect(preview.counts.lessons).toBe(2);
    expect(preview.counts.slots).toBe(preview.slots.length);
    expect(preview.counts.periods).toBe(preview.periods.length);
    expect(preview.counts.slots).toBe(
      preview.slotsByStatus.applicable +
        preview.slotsByStatus.no_room +
        preview.slotsByStatus.multiple_rooms,
    );
  });

  test("não expõe campos pessoais de docentes", () => {
    expect(JSON.stringify(preview)).not.toMatch(/firstname|lastname|email|mobile|gender/i);
    for (const teacher of preview.timetable.teachers) {
      expect(Object.keys(teacher).sort()).toEqual(["id", "short"]);
    }
  });

  test("salas trazem a quantidade de slots", () => {
    const r1 = preview.classrooms.find((room) => room.id === "R1");
    expect(r1?.slots).toBe(preview.slots.filter((slot) => slot.classroomIds.includes("R1")).length);
    expect(preview.classrooms.length).toBe(preview.counts.classrooms);
  });

  test("durações usadas com rótulo do termsdef", () => {
    const labels = preview.termsUsed.map((term) => term.label);
    expect(labels).toContain("Semestre 1");
    const masks = preview.termsUsed.map((term) => term.mask);
    expect(masks).toEqual([...masks].sort());
    expect(preview.termsUsed.reduce((sum, term) => sum + term.slots, 0)).toBe(preview.counts.slots);
  });

  test("sobreposições separadas em certas e possíveis", () => {
    expect(preview.overlaps.certain + preview.overlaps.possible).toBe(
      preview.overlapsDetail.length,
    );
  });
});

describe("agrupamento de avisos", () => {
  test("minimal.xml gera avisos de seção ausente do XML", () => {
    const preview = previewOf("minimal.xml");
    const group = preview.warnings.find((w) => w.source === "xml" && w.code === "section_missing");
    expect(group).toBeDefined();
    expect(group?.count).toBeGreaterThan(0);
    expect(group?.message).toContain("seção");
    expect(group?.examples.length).toBeLessThanOrEqual(5);
  });

  test("problemas da grade entram como source grade", () => {
    const preview = previewOf("lessons-without-cards.xml");
    const group = preview.warnings.find(
      (w) => w.source === "grade" && w.code === "lesson_without_cards",
    );
    expect(group).toBeDefined();
    expect(group?.message).toContain("card");
  });

  test("limita exemplos a 5 e não repete refs", () => {
    const root = readAscXml(bytes("complete.xml"));
    if (!root.ok) throw new Error("rejeitado");
    const { timetable, warnings } = normalizeAsc(root.root);
    const many = Array.from({ length: 9 }, (_, i) => ({
      code: "unknown_reference" as const,
      section: "lessons",
      ref: `X${i % 8}`,
    }));
    const preview = buildImportPreview(
      timetable,
      [...warnings, ...many],
      buildWeeklySlots(timetable),
    );
    const group = preview.warnings.find(
      (w) => w.code === "unknown_reference" && w.source === "xml",
    );
    expect(group?.examples).toHaveLength(5);
    expect(new Set(group?.examples).size).toBe(5);
  });

  test("usa a seção como exemplo quando não há ref", () => {
    const preview = previewOf("minimal.xml");
    const group = preview.warnings.find((w) => w.code === "section_missing");
    expect(group?.examples[0]).toBeTruthy();
  });
});

describe("termsUsed sem termsdef correspondente", () => {
  test("usa a máscara como rótulo e 'Todas as durações' para nulo", () => {
    const root = readAscXml(bytes("complete.xml"));
    if (!root.ok) throw new Error("rejeitado");
    const { timetable, warnings } = normalizeAsc(root.root);
    const base = { lessonId: "L1", period: 1, days: "10000", weeks: null, classroomIds: [] };
    const patched = {
      ...timetable,
      cards: [
        { ...base, terms: "0001" },
        { ...base, period: 3, terms: null },
      ],
    };
    const preview = buildImportPreview(patched, warnings, buildWeeklySlots(patched));
    const labels = new Map(preview.termsUsed.map((term) => [term.mask, term.label]));
    expect(labels.get("0001")).toBe("0001");
    expect(preview.termsUsed.some((term) => term.label === "Todas as durações")).toBe(true);
  });
});

describe("previewAscXml com rejeição", () => {
  test("devolve o erro de leitura", () => {
    const result = previewAscXml(new TextEncoder().encode("<foo/>"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("not_timetable");
  });
});

describe("previewAscXml com falha inesperada", () => {
  test("converte exceções em internal_error sem expor a causa", () => {
    const result = previewAscXml(null as unknown as Uint8Array);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("internal_error");
      expect(result.error.message).not.toContain("null");
    }
  });
});

describe("agrupamento por origem, seção e código", () => {
  test("mesmo código em seções diferentes vira grupos distintos", () => {
    const preview = previewOf("broken-refs.xml");
    const unknown = preview.warnings.filter((w) => w.code === "unknown_reference");
    expect(unknown.map((w) => w.section).sort()).toEqual(["cards", "lessons"]);
    const lessons = unknown.find((w) => w.section === "lessons");
    expect(lessons?.examples).toContain("L2 (subjectid)");
    expect(lessons?.examples.every((example) => /^L\d \(\w+\)$/.test(example))).toBe(true);
  });

  test("grade: never_scheduled e invalid_days ficam em cards", () => {
    const issue = previewOf("broken-refs.xml").warnings.filter((w) => w.source === "grade");
    expect(issue.every((w) => ["cards", "lessons", "periods"].includes(w.section))).toBe(true);
  });
});

function syntheticXml(lessonCount: number): string {
  const lessons = Array.from(
    { length: lessonCount },
    (_, i) =>
      `<lesson id="L${i}" classids="C1" subjectid="S1" periodspercard="1" classroomids="R1"/>`,
  ).join("");
  const cards = Array.from(
    { length: lessonCount },
    (_, i) => `<card lessonid="L${i}" classroomids="R1" period="1" days="10000"/>`,
  ).join("");
  return `<timetable>
    <periods><period period="1" starttime="08:00" endtime="09:50"/></periods>
    <daysdefs/><weeksdefs/><termsdefs/>
    <subjects><subject id="S1" short="Mat"/></subjects><teachers/>
    <classrooms><classroom id="R1" short="101"/></classrooms>
    <classes><class id="C1" short="T1"/></classes>
    <lessons>${lessons}</lessons><cards>${cards}</cards></timetable>`;
}

describe("limites de tamanho", () => {
  test("2000 cards idênticos em uma sala: contagem exata, detalhe truncado, rápido", () => {
    const started = performance.now();
    const result = previewAscXml(new TextEncoder().encode(syntheticXml(2000)));
    const elapsed = performance.now() - started;
    if (!result.ok) throw new Error("rejeitado");
    const { preview } = result;
    expect(preview.overlaps).toEqual({ certain: 1_999_000, possible: 0 });
    expect(preview.overlapsDetail).toHaveLength(200);
    expect(preview.overlapsTruncated).toBe(true);
    expect(preview.partial).toBe(false);
    expect(JSON.stringify(preview).length).toBeLessThan(5_000_000);
    expect(elapsed).toBeLessThan(2000);
  });

  test("mais de 5000 cards: prévia parcial com aviso too_many_cards", () => {
    const result = previewAscXml(new TextEncoder().encode(syntheticXml(5001)));
    if (!result.ok) throw new Error("rejeitado");
    expect(result.preview.counts.cards).toBe(5000);
    expect(result.preview.partial).toBe(true);
    const group = result.preview.warnings.find((w) => w.code === "too_many_cards");
    expect(group?.message).toContain("cards demais");
  });

  test("períodos da prévia são só os utilizáveis, em ordem de relógio", () => {
    const xml = `<timetable><periods>
      <period period="6" starttime="20:10" endtime="22:00"/>
      <period period="7" starttime="19:00" endtime="22:00"/>
      <period period="7" starttime="01:00" endtime="02:00"/>
      <period period="8" starttime="10:00" endtime="10:00"/></periods></timetable>`;
    const result = previewAscXml(new TextEncoder().encode(xml));
    if (!result.ok) throw new Error("rejeitado");
    expect(result.preview.periods.map((p) => p.number)).toEqual([7, 6]);
  });
});
