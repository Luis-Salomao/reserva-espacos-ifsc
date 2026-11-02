import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { previewAscXml } from "#/import-asc/index.ts";
import { toPreviewView } from "./import-preview-view.ts";

const FIXTURES = join(import.meta.dir, "../../test/fixtures/asc");

function viewOf(name: string) {
  const result = previewAscXml(new Uint8Array(readFileSync(join(FIXTURES, name))));
  if (!result.ok) throw new Error("prévia rejeitada");
  return { preview: result.preview, view: toPreviewView(result.preview) };
}

describe("toPreviewView", () => {
  const { preview, view } = viewOf("complete.xml");

  test("não carrega o modelo bruto nem dados pessoais", () => {
    expect(Object.keys(view)).not.toContain("timetable");
    const json = JSON.stringify(view);
    expect(json).not.toContain("Fulano");
    expect(json).not.toContain("exemplo.invalid");
    expect(json).not.toContain("ALUNO-SECRETO");
  });

  test("mantém contagens, avisos e durações", () => {
    expect(view.counts).toEqual(preview.counts);
    expect(view.slotsByStatus).toEqual(preview.slotsByStatus);
    expect(view.warnings).toEqual(preview.warnings);
    expect(view.termsUsed).toEqual(preview.termsUsed);
    expect(view.periods).toEqual(preview.periods);
  });

  test("slot aplicável vai para a sala com rótulos de exibição", () => {
    const room = view.rooms.find((r) => r.id === "R1");
    expect(room?.short).toBe("101");
    const slot = room?.slots[0];
    expect(slot).toMatchObject({
      subject: "Mat",
      classes: "T1",
      teachers: "FT",
      weekday: 0,
      start: "08:00",
      status: "applicable",
      termsLabel: "Semestre 1",
    });
  });

  test("slot com várias salas fica fora da grade e vai para lista própria", () => {
    expect(view.multipleRooms).toHaveLength(preview.slotsByStatus.multiple_rooms);
    expect(view.multipleRooms[0]?.rooms.sort()).toEqual(["101", "LAB"]);
    const inGrid = view.rooms.reduce((sum, room) => sum + room.slots.length, 0);
    expect(inGrid).toBe(preview.slotsByStatus.applicable);
  });

  test("slots sem sala vão para lista própria", () => {
    const { view: other } = viewOf("lessons-without-cards.xml");
    expect(other.withoutRoom.every((slot) => slot.status === "no_room")).toBe(true);
  });

  test("sobreposições trazem sala, dia, horários e rótulos", () => {
    const { view: edge, preview: p } = viewOf("edge-cards.xml");
    expect(edge.overlapsDetail).toHaveLength(p.overlapsDetail.length);
    for (const overlap of edge.overlapsDetail) {
      expect(overlap.room).not.toBe("");
      expect(overlap.a.label).not.toBe("");
    }
  });

  test("cai para nome da disciplina e depois para o id da aula", () => {
    const patched = structuredClone(preview);
    const subject = patched.timetable.subjects.find((s) => s.id === "S1");
    if (subject === undefined) throw new Error("fixture");
    subject.short = "";
    expect(toPreviewView(patched).rooms.find((r) => r.id === "R1")?.slots[0]?.subject).toBe(
      "Matemática",
    );
    subject.name = "";
    expect(toPreviewView(patched).rooms.find((r) => r.id === "R1")?.slots[0]?.subject).toBe("L1");
  });

  test("rótulo de durações usa 'Todas as durações' quando a máscara é vazia", () => {
    const patched = structuredClone(preview);
    for (const slot of patched.slots) slot.termsMask = null;
    patched.termsUsed = [{ mask: "", label: "Todas as durações", slots: patched.slots.length }];
    const slot = toPreviewView(patched).rooms.flatMap((r) => r.slots)[0];
    expect(slot?.termsLabel).toBe("Todas as durações");
  });
});

describe("referências quebradas (broken-refs.xml)", () => {
  const { preview, view } = viewOf("broken-refs.xml");

  test("avisa unknown_reference e lesson_without_class sem vazar valores", () => {
    const codes = view.warnings.map((w) => `${w.section}:${w.code}`);
    expect(codes).toContain("lessons:unknown_reference");
    expect(codes).toContain("cards:unknown_reference");
    expect(codes).toContain("lessons:lesson_without_class");
    expect(JSON.stringify(view)).not.toMatch(/\b(SX|CX|PX|RX|TX)\b/);
  });

  test("sala inexistente deixa o slot sem sala, nunca sob um id cru", () => {
    expect(preview.slotsByStatus).toEqual({ applicable: 2, no_room: 2, multiple_rooms: 0 });
    for (const slot of view.withoutRoom) expect(slot.rooms).toEqual([]);
  });

  test("todo slot aplicável aparece em exatamente uma grade de sala", () => {
    const inGrid = view.rooms.reduce((sum, room) => sum + room.slots.length, 0);
    expect(inGrid).toBe(preview.slotsByStatus.applicable);
    const keys = view.rooms.flatMap((room) => room.slots.map((slot) => slot.key));
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("sobreposições na visão", () => {
  test("cada lado traz sigla da disciplina e das turmas; chaves únicas", () => {
    const { view } = viewOf("edge-cards.xml");
    expect(view.overlapsDetail.length).toBeGreaterThan(0);
    for (const overlap of view.overlapsDetail) {
      expect(overlap.a.classes).toBeDefined();
      expect(overlap.b.classes).toBeDefined();
    }
    const keys = view.overlapsDetail.map((overlap) => overlap.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  test("propaga overlapsTruncated e partial da prévia", () => {
    const { preview } = viewOf("complete.xml");
    const view = toPreviewView({ ...preview, overlapsTruncated: true, partial: true });
    expect(view.overlapsTruncated).toBe(true);
    expect(view.partial).toBe(true);
  });

  test("slot mescla guarda os períodos de cada card", () => {
    const { view } = viewOf("complete.xml");
    const slot = view.rooms.flatMap((room) => room.slots).find((s) => s.subject === "Mat");
    expect(slot?.periods[0]).toBe(slot?.periodFrom);
  });
});
