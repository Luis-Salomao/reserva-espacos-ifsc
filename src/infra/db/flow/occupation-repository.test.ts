import { describe, expect, test } from "bun:test";
import { createOccupationRepository } from "#/infra/db/repos/occupation-repository";
import { insertBatch, insertImported, openDb, type Seed, seed } from "../../../../test/booking-env";

async function setup() {
  const { db } = openDb();
  const s = await seed(db);
  insertBatch(db, s.semester.id, s.admin.id);
  return { db, s, repo: createOccupationRepository(db) };
}

const manual = (s: Seed, over: Record<string, string> = {}) => ({
  id: crypto.randomUUID(),
  spaceId: s.sala1.id,
  startsAt: "2026-11-10T10:00",
  endsAt: "2026-11-10T11:00",
  title: "Reunião",
  createdBy: s.docA.id,
  createdAt: "2026-11-03T12:00:00.000Z",
  ...over,
});

describe("occupation repository", () => {
  test("insere reserva avulsa livre e a lê com criador", async () => {
    const { s, repo } = await setup();
    const input = manual(s);
    expect(await repo.insertManualIfFree(input)).toEqual({ inserted: true });
    const found = await repo.findById(input.id);
    expect(found).toMatchObject({
      source: "manual",
      createdBy: s.docA.id,
      responsibleUserId: s.docA.id,
      status: "ativa",
      batchId: null,
    });
  });

  test("sobreposição com importada é recusada e identifica a ocupação", async () => {
    const { db, s, repo } = await setup();
    insertImported(db, {
      id: "i1",
      spaceId: s.sala1.id,
      date: "2026-11-10",
      start: "10:10",
      end: "12:00",
      title: "MAT1",
      responsibleUserId: s.docA.id,
    });
    const result = await repo.insertManualIfFree(manual(s));
    expect(result).toEqual({
      inserted: false,
      blocking: { title: "MAT1", startsAt: "2026-11-10T10:10", endsAt: "2026-11-10T12:00" },
    });
  });

  test("adjacentes (09:50-10:10) cabem; outro espaço e canceladas não bloqueiam", async () => {
    const { db, s, repo } = await setup();
    const sala1 = s.sala1.id;
    const date = "2026-11-10";
    const none = null;
    insertImported(db, {
      id: "a",
      spaceId: sala1,
      date,
      start: "08:00",
      end: "09:50",
      title: "A",
      responsibleUserId: none,
    });
    insertImported(db, {
      id: "b",
      spaceId: sala1,
      date,
      start: "10:10",
      end: "12:00",
      title: "B",
      responsibleUserId: none,
    });
    insertImported(db, {
      id: "c",
      spaceId: sala1,
      date,
      start: "13:00",
      end: "14:00",
      title: "C",
      responsibleUserId: none,
      status: "cancelada",
    });
    insertImported(db, {
      id: "d",
      spaceId: s.sala2.id,
      date,
      start: "09:50",
      end: "10:10",
      title: "D",
      responsibleUserId: none,
    });
    const gap = manual(s, { startsAt: "2026-11-10T09:50", endsAt: "2026-11-10T10:10" });
    expect((await repo.insertManualIfFree(gap)).inserted).toBe(true);
    const afterCancelled = manual(s, { startsAt: "2026-11-10T13:00", endsAt: "2026-11-10T14:00" });
    expect((await repo.insertManualIfFree(afterCancelled)).inserted).toBe(true);
  });

  test("listActiveInRange devolve só ativas do espaço dentro da janela", async () => {
    const { db, s, repo } = await setup();
    const none = null;
    const at = (id: string, over: Partial<Parameters<typeof insertImported>[1]> = {}) =>
      insertImported(db, {
        id,
        spaceId: s.sala1.id,
        date: "2026-11-10",
        start: "08:00",
        end: "09:00",
        title: id,
        responsibleUserId: none,
        ...over,
      });
    at("a");
    at("x", { start: "09:00", end: "10:00", status: "cancelada" });
    at("o", { spaceId: s.sala2.id });
    at("f", { date: "2026-11-11" });
    const found = await repo.listActiveInRange(s.sala1.id, "2026-11-10T00:00", "2026-11-11T00:00");
    expect(found.map((item) => item.id)).toEqual(["a"]);
  });

  test("cancelOne muda o estado com motivo e não repete", async () => {
    const { s, repo } = await setup();
    const input = manual(s);
    await repo.insertManualIfFree(input);
    expect(await repo.cancelOne(input.id, "usuario", "2026-11-03T13:00:00.000Z")).toBe(true);
    expect(await repo.cancelOne(input.id, "usuario", "2026-11-03T13:00:00.000Z")).toBe(false);
    expect(await repo.findById(input.id)).toMatchObject({ status: "cancelada" });
    expect(await repo.findById("nada")).toBeNull();
  });

  test("série: mesmo lote, título, espaço, dia da semana e horário, de agora em diante", async () => {
    const { db, s, repo } = await setup();
    insertBatch(db, s.semester.id, s.admin.id, "batch-2");
    const base = {
      spaceId: s.sala1.id,
      start: "10:10",
      end: "12:00",
      title: "MAT1",
      responsibleUserId: s.docA.id,
    };
    // terças: 03/11 (já começou), 10/11, 17/11, 24/11
    insertImported(db, { ...base, id: "t0", date: "2026-11-03", start: "08:00", end: "09:00" });
    insertImported(db, { ...base, id: "t1", date: "2026-11-10" });
    insertImported(db, { ...base, id: "t2", date: "2026-11-17" });
    insertImported(db, { ...base, id: "t3", date: "2026-11-24" });
    // parecidas que NÃO entram
    insertImported(db, { ...base, id: "q1", date: "2026-11-11" });
    insertImported(db, { ...base, id: "h1", date: "2026-11-10", start: "13:00", end: "14:50" });
    insertImported(db, {
      ...base,
      id: "ti",
      date: "2026-11-10",
      title: "FIS1",
      start: "08:00",
      end: "09:50",
    });
    insertImported(db, { ...base, id: "sp", date: "2026-11-10", spaceId: s.sala2.id });
    insertImported(db, {
      ...base,
      id: "b2",
      date: "2026-11-10",
      batchId: "batch-2",
      start: "15:00",
      end: "16:00",
    });
    insertImported(db, { ...base, id: "cc", date: "2026-12-01", status: "cancelada" });
    const anchor = await repo.findById("t1");
    if (anchor === null) throw new Error("sem âncora");
    const from = "2026-11-03T09:00";
    expect(await repo.seriesDates(anchor, from)).toEqual([
      "2026-11-10",
      "2026-11-17",
      "2026-11-24",
    ]);
    expect(await repo.cancelSeries(anchor, from, "usuario", "2026-11-03T12:00:00.000Z")).toBe(3);
    const left = await repo.listActiveInRange(s.sala1.id, "2026-11-01T00:00", "2026-12-31T00:00");
    expect(left.map((item) => item.id).sort()).toEqual(["b2", "h1", "q1", "t0", "ti"]);
    expect(await repo.cancelSeries(anchor, from, "usuario", "x")).toBe(0);
  });

  test("a âncora em andamento (começou antes de agora) entra na série", async () => {
    const { db, s, repo } = await setup();
    const base = {
      spaceId: s.sala1.id,
      start: "08:00",
      end: "11:00",
      title: "MAT1",
      responsibleUserId: s.docA.id,
    };
    insertImported(db, { ...base, id: "p", date: "2026-11-03" });
    insertImported(db, { ...base, id: "n", date: "2026-11-10" });
    const anchor = await repo.findById("p");
    if (anchor === null) throw new Error("sem âncora");
    expect(await repo.seriesDates(anchor, "2026-11-03T09:00")).toEqual([
      "2026-11-03",
      "2026-11-10",
    ]);
    expect(await repo.cancelSeries(anchor, "2026-11-03T09:00", "usuario", "x")).toBe(2);
  });

  test("série de ocupação sem lote não existe (só a âncora)", async () => {
    const { s, repo } = await setup();
    const input = manual(s);
    await repo.insertManualIfFree(input);
    const anchor = await repo.findById(input.id);
    if (anchor === null) throw new Error("sem âncora");
    expect(await repo.seriesDates(anchor, "2026-11-03T09:00")).toEqual(["2026-11-10"]);
    expect(await repo.cancelSeries(anchor, "2026-11-03T09:00", "usuario", "x")).toBe(1);
  });

  test("listMine: criador ou responsável, a partir de agora, ordenadas, com nome do espaço e paginação", async () => {
    const { db, s, repo } = await setup();
    const row = (id: string, over: Partial<Parameters<typeof insertImported>[1]>) =>
      insertImported(db, {
        id,
        spaceId: s.sala1.id,
        date: "2026-11-12",
        start: "08:00",
        end: "09:00",
        title: id,
        responsibleUserId: s.docA.id,
        ...over,
      });
    row("R1", {});
    row("Passada", { date: "2026-11-01" });
    row("Outro", { responsibleUserId: s.docB.id });
    row("Cancelada", { status: "cancelada" });
    row("Em andamento", { spaceId: s.sala2.id, date: "2026-11-03", end: "09:30" });
    row("Terminou", { spaceId: s.sala2.id, date: "2026-11-03", start: "07:00", end: "08:30" });
    await repo.insertManualIfFree(
      manual(s, { startsAt: "2026-11-05T10:00", endsAt: "2026-11-05T11:00" }),
    );
    const all = await repo.listMine(s.docA.id, "2026-11-03T09:00", 10, 0);
    expect(all.map((item) => item.title)).toEqual(["Em andamento", "Reunião", "R1"]);
    expect(all[0]?.spaceName).toBe("LAB 1");
    const page = await repo.listMine(s.docA.id, "2026-11-03T09:00", 1, 1);
    expect(page.map((item) => item.title)).toEqual(["Reunião"]);
  });
});
