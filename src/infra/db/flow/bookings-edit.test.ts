import { expect, test } from "bun:test";
import { createOccupationRepository } from "#/infra/db/repos/occupation-repository";
import {
  insertBatch,
  insertImported,
  makeService,
  openDb,
  rawAll,
  seed,
} from "../../../../test/booking-env";

test("edita uma ocorrência própria preservando ID, série e demais datas", async () => {
  const { db } = openDb();
  const s = await seed(db);
  const svc = makeService(db);
  const input = {
    spaceId: s.sala1.id,
    date: "2026-11-10",
    start: "10:00",
    end: "11:00",
    purpose: "Antes",
  };
  const made = await svc.createBooking(s.docA, input);
  if (!made.ok) throw new Error("criação falhou");
  expect(
    await svc.updateBooking(s.docA, {
      ...input,
      occupationId: made.value.id,
      start: "10:30",
      purpose: "Depois",
    }),
  ).toMatchObject({ ok: true, value: { id: made.value.id, start: "10:30", title: "Depois" } });
  expect(await svc.updateBooking(s.admin, { ...input, occupationId: made.value.id })).toMatchObject(
    { ok: false, kind: "forbidden" },
  );
  expect(await svc.updateBooking(s.docB, { ...input, occupationId: made.value.id })).toMatchObject({
    ok: false,
    kind: "forbidden",
  });
  expect(
    await svc.updateBooking(s.docA, { ...input, occupationId: made.value.id, date: "2026-11-02" }),
  ).toMatchObject({ ok: false, kind: "validation" });
  const busy = await svc.createBooking(s.docB, { ...input, start: "11:00", end: "12:00" });
  expect(busy.ok).toBe(true);
  const beforeConflict = rawAll(db, "SELECT * FROM occupations ORDER BY id");
  expect(
    await svc.updateBooking(s.docA, { ...input, occupationId: made.value.id, end: "11:01" }),
  ).toMatchObject({ ok: false, kind: "conflict" });
  expect(rawAll(db, "SELECT * FROM occupations ORDER BY id")).toEqual(beforeConflict);
  expect(await svc.updateBooking(s.docA, { ...input, occupationId: made.value.id })).toMatchObject({
    ok: true,
  });
  insertBatch(db, s.semester.id, s.admin.id);
  insertImported(db, {
    id: "aula",
    spaceId: s.sala1.id,
    date: "2026-11-11",
    start: "10:00",
    end: "11:00",
    title: "Aula",
    responsibleUserId: s.docA.id,
  });
  expect(await svc.updateBooking(s.docA, { ...input, occupationId: "aula" })).toMatchObject({
    ok: false,
    kind: "forbidden",
  });
  await svc.cancelOccupation(s.docA, { occupationId: made.value.id, scope: "data" });
  expect(await svc.updateBooking(s.docA, { ...input, occupationId: made.value.id })).toMatchObject({
    ok: false,
    kind: "conflict",
  });
});

test("uma ocorrência da série muda mantendo autoria, identidade e outras datas", async () => {
  const { db } = openDb();
  const s = await seed(db);
  const svc = makeService(db);
  const input = {
    spaceId: s.sala1.id,
    date: "2026-11-10",
    start: "10:00",
    end: "11:00",
    purpose: "Série",
  };
  const rule = {
    freq: "weekly" as const,
    interval: 1,
    weekdays: [1],
    end: { kind: "count" as const, count: 2 },
  };
  const preview = await svc.previewRecurring(s.docA, { ...input, rule });
  if (!preview.ok) throw new Error("prévia falhou");
  const dates = preview.value.dates.filter((d) => d.free).map((d) => d.date);
  const made = await svc.createRecurring(s.docA, { ...input, rule, confirmed: dates });
  expect(made.ok).toBe(true);
  const list = await svc.myBookings(s.docA, {});
  if (!list.ok || !list.value.items[0] || !list.value.items[1]) throw new Error("sem datas");
  const [first, second] = list.value.items;
  const repo = createOccupationRepository(db);
  const untouched = await repo.findById(second.id);
  const original = await repo.findById(first.id);
  expect(
    await svc.updateBooking(s.docA, {
      ...input,
      occupationId: first.id,
      spaceId: s.sala2.id,
      date: "2026-11-12",
    }),
  ).toMatchObject({ ok: true });
  expect(await repo.findById(first.id)).toMatchObject({
    id: first.id,
    seriesId: original?.seriesId,
    createdBy: s.docA.id,
    spaceId: s.sala2.id,
    startsAt: "2026-11-12T10:00",
  });
  expect(await repo.findById(second.id)).toEqual(untouched);
});

test("a instrução de edição protege autoria, origem, cancelamento e passado diretamente no banco", async () => {
  const { db } = openDb();
  const s = await seed(db);
  const svc = makeService(db);
  const repo = createOccupationRepository(db);
  const input = {
    spaceId: s.sala1.id,
    date: "2026-11-10",
    start: "10:00",
    end: "11:00",
    purpose: "Antes",
  };
  const made = await svc.createBooking(s.docA, input);
  if (!made.ok) throw new Error("criação falhou");
  const update = {
    id: made.value.id,
    createdBy: s.docA.id,
    nowLocal: "2026-11-03T09:00",
    spaceId: s.sala2.id,
    startsAt: "2026-11-12T10:00",
    endsAt: "2026-11-12T11:00",
    title: "Depois",
  };
  expect(await repo.updateManualIfFree({ ...update, createdBy: s.admin.id })).toBe(false);
  expect(await repo.updateManualIfFree({ ...update, nowLocal: "2026-11-10T10:00" })).toBe(false);
  expect(await repo.updateManualIfFree({ ...update, startsAt: "2026-11-02T10:00" })).toBe(false);
  insertBatch(db, s.semester.id, s.admin.id);
  insertImported(db, {
    id: "aula",
    spaceId: s.sala1.id,
    date: "2026-11-11",
    start: "10:00",
    end: "11:00",
    title: "Aula",
    responsibleUserId: s.docA.id,
  });
  expect(await repo.updateManualIfFree({ ...update, id: "aula" })).toBe(false);
  await svc.cancelOccupation(s.docA, { occupationId: made.value.id, scope: "data" });
  expect(await repo.updateManualIfFree(update)).toBe(false);
});
