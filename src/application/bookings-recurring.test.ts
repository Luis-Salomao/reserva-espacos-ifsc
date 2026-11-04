import { describe, expect, test } from "bun:test";
import { createBookingsService } from "#/application/bookings";
import type { Recurrence } from "#/domain/recurrence";
import type { Role, User } from "#/domain/user";
import {
  bookingDeps,
  insertBatch,
  insertImported,
  makeService,
  openDb,
  rawAll,
  type Seed,
  seed,
} from "../../test/booking-env";

async function setup() {
  const { db } = openDb();
  const s = await seed(db);
  insertBatch(db, s.semester.id, s.admin.id);
  return { db, s, svc: makeService(db) };
}

const tuesdays: Recurrence = {
  freq: "weekly",
  interval: 1,
  weekdays: [1],
  end: { kind: "count", count: 4 },
};

const input = (s: Seed, over: Record<string, unknown> = {}) => ({
  spaceId: s.sala1.id,
  date: "2026-11-10",
  start: "10:00",
  end: "11:00",
  purpose: "Monitoria",
  rule: tuesdays,
  ...over,
});

/** MAT1 de outra pessoa ocupa a sala 1 na terça 17/11. */
function blockSeventeenth(db: Parameters<typeof insertImported>[0], s: Seed) {
  insertImported(db, {
    id: "mat1",
    spaceId: s.sala1.id,
    date: "2026-11-17",
    start: "10:10",
    end: "12:00",
    title: "MAT1",
    responsibleUserId: s.docB.id,
  });
}

function manualRows(db: Parameters<typeof rawAll>[0]) {
  return rawAll(
    db,
    "SELECT substr(starts_at, 1, 10) AS date, series_id FROM occupations WHERE source = 'manual' ORDER BY starts_at",
  ) as Array<{ date: string; series_id: string | null }>;
}

function guest(roles: Role[], active = true): User {
  return { id: "u-x", email: "x@x.org", name: "X", code: null, roles, active, placeholder: false };
}

describe("previewRecurring", () => {
  test("separa livres e conflitos; o motivo traz título e horário, sem pessoas", async () => {
    const { db, s, svc } = await setup();
    blockSeventeenth(db, s);
    const result = await svc.previewRecurring(s.docA, input(s));
    expect(result).toEqual({
      ok: true,
      value: {
        summary: "Toda terça, até 01/12, 4 datas",
        dates: [
          { date: "2026-11-10", free: true },
          { date: "2026-11-17", free: false, reason: "MAT1, 10:10–12:00" },
          { date: "2026-11-24", free: true },
          { date: "2026-12-01", free: true },
        ],
      },
    });
    expect(JSON.stringify(result)).not.toContain("Pessoa");
    expect(manualRows(db)).toEqual([]);
  });

  test("conflitos de outras salas e horários não contam; vários conflitos na mesma data se juntam", async () => {
    const { db, s, svc } = await setup();
    const base = { date: "2026-11-10", title: "X", responsibleUserId: null };
    insertImported(db, { ...base, id: "o1", spaceId: s.sala2.id, start: "10:00", end: "11:00" });
    insertImported(db, { ...base, id: "o2", spaceId: s.sala1.id, start: "11:00", end: "12:00" });
    insertImported(db, { ...base, id: "o3", spaceId: s.sala1.id, start: "09:00", end: "10:00" });
    const result = await svc.previewRecurring(
      s.docA,
      input(s, { rule: { ...tuesdays, end: { kind: "count", count: 1 } } }),
    );
    expect(result.ok && result.value.dates).toEqual([{ date: "2026-11-10", free: true }]);
    insertImported(db, { ...base, id: "o4", spaceId: s.sala1.id, start: "09:30", end: "10:15" });
    insertImported(db, { ...base, id: "o5", spaceId: s.sala1.id, start: "10:45", end: "11:30" });
    const again = await svc.previewRecurring(
      s.docA,
      input(s, { rule: { ...tuesdays, end: { kind: "count", count: 1 } } }),
    );
    expect(again.ok && again.value.dates).toEqual([
      { date: "2026-11-10", free: false, reason: "X, 09:30–10:15; X, 10:45–11:30" },
    ]);
  });

  test("mesmas validações da reserva simples, com o campo; regra inválida cai em 'repeat'", async () => {
    const { s, svc } = await setup();
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ purpose: "  " }, "purpose"],
      [{ date: "2026-11-02" }, "date"],
      [{ start: "05:00", end: "06:30" }, "start"],
      [{ end: "23:30" }, "end"],
      [{ rule: { ...tuesdays, end: { kind: "count", count: 121 } } }, "repeat"],
      [{ rule: { ...tuesdays, weekdays: [] } }, "repeat"],
    ];
    for (const [over, field] of cases) {
      expect(await svc.previewRecurring(s.docA, input(s, over))).toMatchObject({
        ok: false,
        kind: "validation",
        field,
      });
    }
    expect(await svc.previewRecurring(s.docA, input(s, { spaceId: "nada" }))).toMatchObject({
      ok: false,
      kind: "not_found",
    });
  });

  test("sem papel de reserva ou conta inativa: 'forbidden'", async () => {
    const { s, svc } = await setup();
    for (const user of [guest([]), guest(["docente"], false)]) {
      expect(await svc.previewRecurring(user, input(s))).toMatchObject({
        ok: false,
        kind: "forbidden",
      });
      expect(
        await svc.createRecurring(user, { ...input(s), confirmed: ["2026-11-10"] }),
      ).toMatchObject({ ok: false, kind: "forbidden" });
    }
  });
});

describe("createRecurring", () => {
  test("reserva só as livres, ligadas pelo mesmo id de série, e devolve as puladas", async () => {
    const { db, s, svc } = await setup();
    blockSeventeenth(db, s);
    const confirmed = ["2026-11-10", "2026-11-24", "2026-12-01"];
    const result = await svc.createRecurring(s.docA, { ...input(s), confirmed });
    if (!result.ok || !result.value.created) throw new Error("esperava série criada");
    expect(result.value.dates).toEqual(confirmed);
    expect(result.value.skipped).toEqual([
      { date: "2026-11-17", free: false, reason: "MAT1, 10:10–12:00" },
    ]);
    const rows = manualRows(db);
    expect(rows.map((row) => row.date)).toEqual(confirmed);
    expect(new Set(rows.map((row) => row.series_id))).toEqual(new Set([result.value.seriesId]));
    const mine = await svc.myBookings(s.docA, {});
    expect(mine.ok && mine.value.items.map((item) => item.date)).toEqual(confirmed);
  });

  test("nenhuma data livre: nada é reservado", async () => {
    const { db, s, svc } = await setup();
    blockSeventeenth(db, s);
    const result = await svc.createRecurring(s.docA, {
      ...input(s, { date: "2026-11-17", rule: { ...tuesdays, end: { kind: "count", count: 1 } } }),
      confirmed: [],
    });
    expect(result).toMatchObject({
      ok: true,
      value: {
        created: false,
        message: "Nenhuma data da série está livre; nada foi reservado.",
        preview: { dates: [{ date: "2026-11-17", free: false }] },
      },
    });
    expect(manualRows(db)).toEqual([]);
  });

  test("livres mudaram desde a prévia: nada é reservado e volta a prévia atualizada", async () => {
    const { db, s, svc } = await setup();
    const seen = await svc.previewRecurring(s.docA, input(s));
    const confirmed = seen.ok ? seen.value.dates.map((item) => item.date) : [];
    expect(confirmed).toHaveLength(4);
    blockSeventeenth(db, s);
    const result = await svc.createRecurring(s.docA, { ...input(s), confirmed });
    expect(result).toMatchObject({
      ok: true,
      value: {
        created: false,
        message: expect.stringContaining("As datas livres mudaram desde a prévia"),
        preview: {
          dates: expect.arrayContaining([
            { date: "2026-11-17", free: false, reason: "MAT1, 10:10–12:00" },
          ]),
        },
      },
    });
    expect(manualRows(db)).toEqual([]);
    // confirmação com uma data a menos que as livres também é recusada
    const fewer = await svc.createRecurring(s.docA, {
      ...input(s),
      confirmed: ["2026-11-10", "2026-11-24"],
    });
    expect(fewer.ok && fewer.value.created).toBe(false);
    expect(manualRows(db)).toEqual([]);
  });

  test("corrida entre a checagem e a gravação: nada é gravado e a prévia já mostra o novo conflito", async () => {
    const { db, s } = await setup();
    const deps = bookingDeps(db);
    const real = deps.occupations;
    const svc = createBookingsService({
      ...deps,
      occupations: {
        ...real,
        async insertSeriesIfFree(series) {
          blockSeventeenth(db, s);
          return real.insertSeriesIfFree(series);
        },
      },
    });
    const confirmed = ["2026-11-10", "2026-11-17", "2026-11-24", "2026-12-01"];
    const result = await svc.createRecurring(s.docA, { ...input(s), confirmed });
    expect(result).toMatchObject({
      ok: true,
      value: {
        created: false,
        preview: {
          dates: expect.arrayContaining([
            { date: "2026-11-17", free: false, reason: "MAT1, 10:10–12:00" },
          ]),
        },
      },
    });
    expect(manualRows(db)).toEqual([]);
  });

  test("série em 'Minhas reservas': marca inSeries; cancelar 'esta e as próximas' poupa as anteriores", async () => {
    const { db, s, svc } = await setup();
    const confirmed = ["2026-11-10", "2026-11-17", "2026-11-24", "2026-12-01"];
    await svc.createRecurring(s.docA, { ...input(s), confirmed });
    await svc.createBooking(s.docA, {
      spaceId: s.sala2.id,
      date: "2026-11-11",
      start: "10:00",
      end: "11:00",
      purpose: "Avulsa",
    });
    const mine = await svc.myBookings(s.docA, {});
    const items = mine.ok ? mine.value.items : [];
    expect(items.map((item) => [item.date, item.inSeries])).toEqual([
      ["2026-11-10", true],
      ["2026-11-11", false],
      ["2026-11-17", true],
      ["2026-11-24", true],
      ["2026-12-01", true],
    ]);
    const second = items.find((item) => item.date === "2026-11-17");
    const lone = items.find((item) => item.date === "2026-11-11");
    if (second === undefined || lone === undefined) throw new Error("sem reservas");

    expect(await svc.previewSeries(s.docA, second.id)).toEqual({
      ok: true,
      value: { dates: ["2026-11-17", "2026-11-24", "2026-12-01"] },
    });
    expect(await svc.previewSeries(s.docB, second.id)).toMatchObject({
      ok: false,
      kind: "forbidden",
    });
    expect(await svc.previewSeries(s.docA, lone.id)).toMatchObject({
      ok: false,
      kind: "validation",
    });
    expect(
      await svc.cancelOccupation(s.docA, {
        occupationId: second.id,
        scope: "serie",
        expectedCount: 2,
      }),
    ).toMatchObject({ ok: false, kind: "conflict" });
    expect(
      await svc.cancelOccupation(s.docA, {
        occupationId: second.id,
        scope: "serie",
        expectedCount: 3,
      }),
    ).toEqual({ ok: true, value: { cancelled: 3 } });
    const left = await svc.myBookings(s.docA, {});
    expect(left.ok && left.value.items.map((item) => item.date)).toEqual([
      "2026-11-10",
      "2026-11-11",
    ]);
    expect(manualRows(db)).toHaveLength(5);
  });

  test("admin cancela 'esta e as próximas' da série de outra pessoa", async () => {
    const { s, svc } = await setup();
    await svc.createRecurring(s.docA, {
      ...input(s),
      confirmed: ["2026-11-10", "2026-11-17", "2026-11-24", "2026-12-01"],
    });
    const mine = await svc.myBookings(s.docA, {});
    const first = mine.ok ? mine.value.items[0] : undefined;
    if (first === undefined) throw new Error("sem reservas");
    expect(await svc.cancelOccupation(s.admin, { occupationId: first.id, scope: "serie" })).toEqual(
      {
        ok: true,
        value: { cancelled: 4 },
      },
    );
  });

  test("validação também na confirmação", async () => {
    const { db, s, svc } = await setup();
    expect(
      await svc.createRecurring(s.docA, {
        ...input(s, { purpose: "" }),
        confirmed: ["2026-11-10"],
      }),
    ).toMatchObject({ ok: false, field: "purpose" });
    expect(manualRows(db)).toEqual([]);
  });
});
