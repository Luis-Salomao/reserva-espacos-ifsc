import { describe, expect, test } from "bun:test";
import { diffVersions, type VersionOccurrence } from "./version-diff";

const occ = (over: Partial<VersionOccurrence> = {}): VersionOccurrence => ({
  lessonKey: "MAT-1A",
  date: "2026-08-03",
  spaceId: "sala-1",
  startsAt: "2026-08-03T08:00",
  endsAt: "2026-08-03T09:50",
  responsibleUserId: "u1",
  status: "ativa",
  ...over,
});

describe("diffVersions", () => {
  test("iguais são inalteradas", () => {
    const r = diffVersions([occ()], [occ()]);
    expect(r.unchanged).toHaveLength(1);
    expect(r.changed).toHaveLength(0);
    expect(r.removed).toHaveLength(0);
    expect(r.added).toHaveLength(0);
  });

  test("cancelada que continua igual fica mantida cancelada e nunca é inserida", () => {
    const r = diffVersions([occ({ status: "cancelada" })], [occ()]);
    expect(r.keptCancelled).toHaveLength(1);
    expect(r.unchanged).toHaveLength(0);
    expect(r.changed).toHaveLength(0);
    expect(r.added).toHaveLength(0);
  });

  test("mudança de sala cancela a antiga e insere a nova", () => {
    const r = diffVersions([occ()], [occ({ spaceId: "sala-2" })]);
    expect(r.changed).toHaveLength(1);
    expect(r.changed[0]?.cancel.map((o) => o.spaceId)).toEqual(["sala-1"]);
    expect(r.changed[0]?.insert.map((o) => o.spaceId)).toEqual(["sala-2"]);
  });

  test("mudança de horário é alteração", () => {
    const r = diffVersions(
      [occ()],
      [occ({ startsAt: "2026-08-03T10:00", endsAt: "2026-08-03T11:50" })],
    );
    expect(r.changed).toHaveLength(1);
    expect(r.unchanged).toHaveLength(0);
  });

  test("só responsável mudou", () => {
    const r = diffVersions([occ()], [occ({ responsibleUserId: "u2" })]);
    expect(r.responsibleChanged).toHaveLength(1);
    expect(r.responsibleChanged[0]?.next.responsibleUserId).toBe("u2");
    expect(r.changed).toHaveLength(0);
  });

  test("removida e incluída", () => {
    const r = diffVersions([occ({ lessonKey: "A" })], [occ({ lessonKey: "B" })]);
    expect(r.removed.map((o) => o.lessonKey)).toEqual(["A"]);
    expect(r.added.map((o) => o.lessonKey)).toEqual(["B"]);
  });

  test("multiconjunto: duas iguais contra uma", () => {
    const r = diffVersions([occ({ occupationId: "a" }), occ({ occupationId: "b" })], [occ()]);
    expect(r.unchanged).toHaveLength(1);
    expect(r.removed).toHaveLength(1);
    const r2 = diffVersions([occ()], [occ(), occ()]);
    expect(r2.unchanged).toHaveLength(1);
    expect(r2.added).toHaveLength(1);
  });

  test("restos canceladas não são canceladas de novo", () => {
    const r = diffVersions([occ({ status: "cancelada" })], [occ({ spaceId: "sala-2" })]);
    expect(r.changed[0]?.cancel).toHaveLength(0);
    expect(r.changed[0]?.alreadyCancelled).toHaveLength(1);
    expect(r.changed[0]?.insert).toHaveLength(1);
  });

  test("só restos atuais: ativa vira remoção, cancelada vai para a lista própria", () => {
    const r = diffVersions(
      [occ({ lessonKey: "A" }), occ({ lessonKey: "B", status: "cancelada" })],
      [],
    );
    expect(r.removed.map((o) => o.lessonKey)).toEqual(["A"]);
    expect(r.removedAlreadyCancelled.map((o) => o.lessonKey)).toEqual(["B"]);
  });

  test("ordem de entrada é irrelevante", () => {
    const a = occ({ lessonKey: "A", date: "2026-08-04", startsAt: "2026-08-04T08:00" });
    const b = occ({ lessonKey: "B" });
    const c = occ({ lessonKey: "C", spaceId: "x" });
    const n = [occ({ lessonKey: "C", spaceId: "y" }), b, a];
    const r1 = diffVersions([a, b, c], n);
    const r2 = diffVersions([c, b, a], [...n].reverse());
    expect(r2).toEqual(r1);
    expect(r1.unchanged.map((p) => p.current.lessonKey)).toEqual(["B", "A"]);
  });

  test("cancelada atual casada com uma nova de outro responsável continua mantida cancelada", () => {
    const r = diffVersions(
      [occ({ status: "cancelada", responsibleUserId: "u1" })],
      [occ({ responsibleUserId: "u2" })],
    );
    expect(r.keptCancelled).toHaveLength(1);
    expect(r.responsibleChanged).toHaveLength(0);
    expect(r.added).toHaveLength(0);
    expect(r.changed).toHaveLength(0);
  });

  test("atual [ativa X, cancelada X] contra [X]: inalterada e a cancelada sobra sem inserir nada", () => {
    const r = diffVersions([occ({ status: "cancelada" }), occ()], [occ()]);
    expect(r.unchanged).toHaveLength(1);
    expect(r.unchanged[0]?.current.status).toBe("ativa");
    expect(r.removedAlreadyCancelled).toHaveLength(1);
    expect(r.keptCancelled).toHaveLength(0);
    expect(r.added).toHaveLength(0);
    expect(r.changed).toHaveLength(0);
    expect(r.removed).toHaveLength(0);
  });

  test("duas passadas: o mesmo horário com o mesmo responsável casa antes de qualquer responsável", () => {
    const r = diffVersions(
      [occ({ responsibleUserId: "u1" }), occ({ responsibleUserId: "u2" })],
      [occ({ responsibleUserId: "u2" })],
    );
    expect(r.unchanged.map((p) => p.current.responsibleUserId)).toEqual(["u2"]);
    expect(r.responsibleChanged).toHaveLength(0);
    expect(r.removed.map((o) => o.responsibleUserId)).toEqual(["u1"]);
  });

  test("duas passadas: sobra de responsável diferente ainda casa pelo horário na segunda passada", () => {
    const r = diffVersions(
      [occ({ responsibleUserId: "u1" }), occ({ responsibleUserId: "u2" })],
      [occ({ responsibleUserId: "u2" }), occ({ responsibleUserId: "u3" })],
    );
    expect(r.unchanged).toHaveLength(1);
    expect(r.responsibleChanged.map((p) => p.next.responsibleUserId)).toEqual(["u3"]);
    expect(r.removed).toHaveLength(0);
    expect(r.added).toHaveLength(0);
  });

  test("desempenho com 20 000 ocorrências por lado", () => {
    const make = (shift: number) =>
      Array.from({ length: 20000 }, (_, i) => {
        const date = `2026-08-${String((i % 28) + 1).padStart(2, "0")}`;
        return occ({
          lessonKey: `L${i}`,
          date,
          startsAt: `${date}T08:00`,
          endsAt: `${date}T09:50`,
          spaceId: i % 100 === 0 ? `s${shift}` : "s",
        });
      });
    const start = performance.now();
    const r = diffVersions(make(0), make(1));
    const ms = performance.now() - start;
    expect(r.changed).toHaveLength(200);
    expect(r.unchanged).toHaveLength(19800);
    expect(ms).toBeLessThan(200);
  });
});
