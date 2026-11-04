import { describe, expect, test } from "bun:test";
import { createOccupationRepository } from "#/infra/db/repos/occupation-repository";
import { insertBatch, insertImported, openDb, rawAll, seed } from "../../../../test/booking-env";

async function setup() {
  const { db } = openDb();
  const s = await seed(db);
  insertBatch(db, s.semester.id, s.admin.id);
  return { db, s, repo: createOccupationRepository(db) };
}

const slot = (id: string, date: string) => ({
  id,
  startsAt: `${date}T10:00`,
  endsAt: `${date}T11:00`,
});

function seriesRows(db: Parameters<typeof rawAll>[0], seriesId: string) {
  return rawAll(
    db,
    `SELECT id, source, status, created_by, responsible_user_id, title FROM occupations
     WHERE series_id = '${seriesId}' ORDER BY starts_at`,
  ) as Array<Record<string, string>>;
}

describe("insertSeriesIfFree", () => {
  test("todas livres: grava todas como avulsas da série, com o autor como responsável", async () => {
    const { db, s, repo } = await setup();
    const inserted = await repo.insertSeriesIfFree({
      seriesId: "ser-1",
      spaceId: s.sala1.id,
      title: "Monitoria",
      createdBy: s.docA.id,
      createdAt: "2026-11-03T12:00:00.000Z",
      slots: [slot("a", "2026-11-10"), slot("b", "2026-11-17"), slot("c", "2026-11-24")],
    });
    expect(inserted).toBe(true);
    const rows = seriesRows(db, "ser-1");
    expect(rows.map((row) => row.id)).toEqual(["a", "b", "c"]);
    for (const row of rows) {
      expect(row).toMatchObject({
        source: "manual",
        status: "ativa",
        created_by: s.docA.id,
        responsible_user_id: s.docA.id,
        title: "Monitoria",
      });
    }
    const found = await repo.findById("b");
    expect(found?.seriesId).toBe("ser-1");
  });

  test("conflito só na última data: nenhuma data da série fica gravada", async () => {
    const { db, s, repo } = await setup();
    insertImported(db, {
      id: "imp",
      spaceId: s.sala1.id,
      date: "2026-11-24",
      start: "10:30",
      end: "12:00",
      title: "MAT1",
      responsibleUserId: null,
    });
    const inserted = await repo.insertSeriesIfFree({
      seriesId: "ser-2",
      spaceId: s.sala1.id,
      title: "Monitoria",
      createdBy: s.docA.id,
      createdAt: "2026-11-03T12:00:00.000Z",
      slots: [slot("a", "2026-11-10"), slot("b", "2026-11-17"), slot("c", "2026-11-24")],
    });
    expect(inserted).toBe(false);
    expect(seriesRows(db, "ser-2")).toEqual([]);
    expect(await repo.findById("a")).toBeNull();
  });

  test("erro na última instrução desfaz as anteriores", async () => {
    const { db, s, repo } = await setup();
    await expect(
      repo.insertSeriesIfFree({
        seriesId: "ser-3",
        spaceId: s.sala1.id,
        title: "Monitoria",
        createdBy: s.docA.id,
        createdAt: "2026-11-03T12:00:00.000Z",
        // id repetido: a última inserção estoura a chave primária
        slots: [slot("a", "2026-11-10"), slot("b", "2026-11-17"), slot("a", "2026-11-24")],
      }),
    ).rejects.toThrow();
    expect(seriesRows(db, "ser-3")).toEqual([]);
  });

  test("ocupação cancelada não bloqueia; série vazia não grava nada", async () => {
    const { db, s, repo } = await setup();
    insertImported(db, {
      id: "old",
      spaceId: s.sala1.id,
      date: "2026-11-10",
      start: "10:00",
      end: "11:00",
      title: "MAT1",
      responsibleUserId: null,
      status: "cancelada",
    });
    const base = {
      spaceId: s.sala1.id,
      title: "Monitoria",
      createdBy: s.docA.id,
      createdAt: "2026-11-03T12:00:00.000Z",
    };
    expect(
      await repo.insertSeriesIfFree({
        ...base,
        seriesId: "ser-4",
        slots: [slot("a", "2026-11-10")],
      }),
    ).toBe(true);
    expect(await repo.insertSeriesIfFree({ ...base, seriesId: "ser-5", slots: [] })).toBe(false);
  });
});
