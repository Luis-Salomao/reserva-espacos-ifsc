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

test("prévia e edição da série preservam exceções canceladas e deslocam as datas futuras", async () => {
  const { db } = openDb();
  const s = await seed(db);
  const svc = makeService(db);
  const input = {
    spaceId: s.sala1.id,
    date: "2026-11-10",
    start: "10:00",
    end: "11:00",
    purpose: "Série antes",
  };
  const rule = {
    freq: "weekly" as const,
    interval: 1,
    weekdays: [1],
    end: { kind: "count" as const, count: 3 },
  };
  const preview = await svc.previewRecurring(s.docA, { ...input, rule });
  if (!preview.ok) throw new Error("prévia da recorrência falhou");
  const dates = preview.value.dates.filter((d) => d.free).map((d) => d.date);
  const created = await svc.createRecurring(s.docA, { ...input, rule, confirmed: dates });
  if (!created.ok || !created.value.created) throw new Error("criação da recorrência falhou");
  const rows = rawAll(
    db,
    "SELECT id FROM occupations WHERE series_id IS NOT NULL ORDER BY starts_at",
  ) as {
    id: string;
  }[];
  const ids = rows.map((row) => row.id);
  const [firstId, exceptionId, lastId] = ids;
  if (!firstId || !exceptionId || !lastId) throw new Error("série incompleta");
  await svc.cancelOccupation(s.docA, { occupationId: exceptionId, scope: "data" });

  const update = {
    occupationId: lastId,
    spaceId: s.sala2.id,
    date: "2026-11-25",
    start: "13:00",
    end: "14:00",
    purpose: "Série depois",
    scope: "serie" as const,
  };
  const checked = await svc.previewSeriesUpdate(s.docA, update);
  expect(checked).toMatchObject({
    ok: true,
    value: {
      count: 2,
      changes: [
        { from: "2026-11-10", to: "2026-11-11" },
        { from: "2026-11-24", to: "2026-11-25" },
      ],
    },
  });
  if (!checked.ok) throw new Error("prévia da edição de série falhou");
  const saved = await svc.updateSeriesBooking(s.docA, {
    ...update,
    expectedCount: 2,
    expectedRevision: checked.value.revision,
  });
  expect(saved).toMatchObject({ ok: true, value: { updated: 2 } });

  const repo = createOccupationRepository(db);
  expect(await repo.findById(firstId)).toMatchObject({
    id: firstId,
    startsAt: "2026-11-11T13:00",
    endsAt: "2026-11-11T14:00",
    spaceId: s.sala2.id,
    title: "Série depois",
    status: "ativa",
  });
  expect(await repo.findById(exceptionId)).toMatchObject({
    id: exceptionId,
    startsAt: "2026-11-17T10:00",
    status: "cancelada",
  });
  expect(await repo.findById(lastId)).toMatchObject({
    id: lastId,
    startsAt: "2026-11-25T13:00",
    status: "ativa",
  });
});

test("escopo desta e das próximas deixa as ocorrências anteriores intactas", async () => {
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
    end: { kind: "count" as const, count: 3 },
  };
  const preview = await svc.previewRecurring(s.docA, { ...input, rule });
  if (!preview.ok) throw new Error("prévia da recorrência falhou");
  const created = await svc.createRecurring(s.docA, {
    ...input,
    rule,
    confirmed: preview.value.dates.filter((d) => d.free).map((d) => d.date),
  });
  if (!created.ok || !created.value.created) throw new Error("criação da recorrência falhou");
  const rows = rawAll(
    db,
    "SELECT * FROM occupations WHERE series_id IS NOT NULL ORDER BY starts_at",
  ) as {
    id: string;
  }[];
  const [firstId, anchorId, nextId] = rows.map((row) => row.id);
  if (!firstId || !anchorId || !nextId) throw new Error("série incompleta");
  const update = {
    occupationId: anchorId,
    spaceId: s.sala2.id,
    date: "2026-11-18",
    start: "15:00",
    end: "16:00",
    purpose: "Série parcial",
    scope: "future" as const,
  };
  const checked = await svc.previewSeriesUpdate(s.docA, update);
  expect(checked).toMatchObject({
    ok: true,
    value: {
      count: 2,
      changes: [
        { from: "2026-11-17", to: "2026-11-18" },
        { from: "2026-11-24", to: "2026-11-25" },
      ],
    },
  });
  if (!checked.ok) throw new Error("prévia da edição de série falhou");
  expect(
    await svc.updateSeriesBooking(s.docA, {
      ...update,
      expectedCount: 2,
      expectedRevision: checked.value.revision,
    }),
  ).toMatchObject({ ok: true, value: { updated: 2 } });
  const repo = createOccupationRepository(db);
  expect(await repo.findById(firstId)).toMatchObject({
    startsAt: "2026-11-10T10:00",
    spaceId: s.sala1.id,
    title: "Série",
  });
  expect(await repo.findById(anchorId)).toMatchObject({
    startsAt: "2026-11-18T15:00",
    spaceId: s.sala2.id,
    title: "Série parcial",
  });
  expect(await repo.findById(nextId)).toMatchObject({
    startsAt: "2026-11-25T15:00",
    spaceId: s.sala2.id,
    title: "Série parcial",
  });
});

test("confirmação rejeita série alterada depois da prévia mesmo com a mesma quantidade", async () => {
  const { db } = openDb();
  const s = await seed(db);
  const svc = makeService(db);
  const input = {
    spaceId: s.sala1.id,
    date: "2026-11-10",
    start: "10:00",
    end: "11:00",
    purpose: "Série antes",
  };
  const rule = {
    freq: "weekly" as const,
    interval: 1,
    weekdays: [1],
    end: { kind: "count" as const, count: 2 },
  };
  const recurring = await svc.previewRecurring(s.docA, { ...input, rule });
  if (!recurring.ok) throw new Error("prévia da recorrência falhou");
  const created = await svc.createRecurring(s.docA, {
    ...input,
    rule,
    confirmed: recurring.value.dates.filter((item) => item.free).map((item) => item.date),
  });
  if (!created.ok || !created.value.created) throw new Error("criação da recorrência falhou");
  const rows = rawAll(
    db,
    "SELECT id FROM occupations WHERE series_id IS NOT NULL ORDER BY starts_at",
  ) as { id: string }[];
  const [anchor] = rows;
  if (!anchor) throw new Error("série incompleta");
  const update = {
    occupationId: anchor.id,
    spaceId: s.sala2.id,
    date: "2026-11-11",
    start: "13:00",
    end: "14:00",
    purpose: "Série depois",
    scope: "serie" as const,
  };
  const preview = await svc.previewSeriesUpdate(s.docA, update);
  if (!preview.ok) throw new Error("prévia da edição de série falhou");

  const rawDb = (
    db as unknown as {
      $client: { query(sql: string): { run(...params: unknown[]): unknown } };
    }
  ).$client;
  rawDb
    .query("UPDATE occupations SET title = ? WHERE id = ?")
    .run("Alterada depois da prévia", anchor.id);

  expect(
    await svc.updateSeriesBooking(s.docA, {
      ...update,
      expectedCount: preview.value.count,
      expectedRevision: preview.value.revision,
    }),
  ).toMatchObject({ ok: false, kind: "conflict" });
  expect(rawAll(db, `SELECT title FROM occupations WHERE id = '${anchor.id}'`)).toEqual([
    { title: "Alterada depois da prévia" },
  ]);
});

test("edição de série aborta tudo se uma ocorrência futura tiver conflito", async () => {
  const { db } = openDb();
  const s = await seed(db);
  const svc = makeService(db);
  const input = {
    spaceId: s.sala1.id,
    date: "2026-11-10",
    start: "10:00",
    end: "11:00",
    purpose: "Série antes",
  };
  const rule = {
    freq: "weekly" as const,
    interval: 1,
    weekdays: [1],
    end: { kind: "count" as const, count: 2 },
  };
  const preview = await svc.previewRecurring(s.docA, { ...input, rule });
  if (!preview.ok) throw new Error("prévia da recorrência falhou");
  const dates = preview.value.dates.filter((d) => d.free).map((d) => d.date);
  const created = await svc.createRecurring(s.docA, { ...input, rule, confirmed: dates });
  if (!created.ok || !created.value.created) throw new Error("criação da recorrência falhou");
  const rows = rawAll(
    db,
    "SELECT id FROM occupations WHERE series_id IS NOT NULL ORDER BY starts_at",
  ) as {
    id: string;
  }[];
  const [firstId] = rows.map((row) => row.id);
  if (!firstId) throw new Error("série incompleta");
  const other = await svc.createBooking(s.docB, {
    spaceId: s.sala2.id,
    date: "2026-11-18",
    start: "13:00",
    end: "14:00",
    purpose: "Conflito",
  });
  expect(other.ok).toBe(true);
  const before = rawAll(
    db,
    "SELECT id, space_id, starts_at, ends_at, title, status FROM occupations ORDER BY id",
  );
  const update = {
    occupationId: firstId,
    spaceId: s.sala2.id,
    date: "2026-11-11",
    start: "13:00",
    end: "14:00",
    purpose: "Série depois",
    scope: "future" as const,
  };
  expect(await svc.previewSeriesUpdate(s.docA, update)).toMatchObject({
    ok: false,
    kind: "conflict",
  });
  expect(
    await svc.updateSeriesBooking(s.docA, {
      ...update,
      expectedCount: 2,
      expectedRevision: "0".repeat(64),
    }),
  ).toMatchObject({ ok: false, kind: "conflict" });
  expect(
    rawAll(
      db,
      "SELECT id, space_id, starts_at, ends_at, title, status FROM occupations ORDER BY id",
    ),
  ).toEqual(before);
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
