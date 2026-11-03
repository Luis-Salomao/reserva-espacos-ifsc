import { describe, expect, test } from "bun:test";
import type { Role, User } from "#/domain/user";
import {
  insertBatch,
  insertImported,
  makeService,
  openDb,
  rawAll,
  type Seed,
  seed,
  TODAY,
} from "../../test/booking-env";

async function setup() {
  const { db } = openDb();
  const s = await seed(db);
  insertBatch(db, s.semester.id, s.admin.id);
  return { db, s, svc: makeService(db) };
}

const book = (s: Seed, over: Partial<Record<string, string>> = {}) => ({
  spaceId: s.sala1.id,
  date: "2026-11-10",
  start: "10:00",
  end: "11:00",
  purpose: "Reunião de área",
  ...over,
});

function guest(roles: Role[], active = true): User {
  return { id: "u-x", email: "x@x.org", name: "X", code: null, roles, active };
}

describe("createBooking", () => {
  test("docente, horarios e admin reservam; criador e responsável são o reservante", async () => {
    const { s, svc } = await setup();
    for (const [index, user] of [s.docA, s.horarios, s.admin].entries()) {
      const hour = String(8 + index).padStart(2, "0");
      const result = await svc.createBooking(
        user,
        book(s, { start: `${hour}:00`, end: `${hour}:50` }),
      );
      expect(result.ok).toBe(true);
    }
    const mine = await svc.myBookings(s.docA, {});
    expect(mine.ok && mine.value.items).toHaveLength(1);
  });

  test("conta sem papel de reserva ou inativa é recusada com 'forbidden'", async () => {
    const { s, svc } = await setup();
    const none = await svc.createBooking(guest([]), book(s));
    expect(none).toMatchObject({ ok: false, kind: "forbidden" });
    const off = await svc.createBooking(guest(["docente"], false), book(s));
    expect(off).toMatchObject({ ok: false, kind: "forbidden" });
  });

  test("finalidade: 1 a 120 caracteres, sem controle; é aparada", async () => {
    const { s, svc } = await setup();
    expect(await svc.createBooking(s.docA, book(s, { purpose: "   " }))).toMatchObject({
      ok: false,
      kind: "validation",
      field: "purpose",
    });
    expect(await svc.createBooking(s.docA, book(s, { purpose: "x".repeat(121) }))).toMatchObject({
      ok: false,
      field: "purpose",
    });
    expect(await svc.createBooking(s.docA, book(s, { purpose: "a\u0000b" }))).toMatchObject({
      ok: false,
      field: "purpose",
    });
    const okResult = await svc.createBooking(
      s.docA,
      book(s, { purpose: `  ${"y".repeat(120)}  ` }),
    );
    expect(okResult.ok && okResult.value.title).toBe("y".repeat(120));
  });

  test("data, horários, expediente e passado são validados com o campo", async () => {
    const { s, svc } = await setup();
    const cases: Array<[Partial<Record<string, string>>, string]> = [
      [{ date: "2026-02-30" }, "date"],
      [{ start: "9:00" }, "start"],
      [{ end: "10:00" }, "end"],
      [{ start: "05:00", end: "06:30" }, "start"],
      [{ start: "22:00", end: "23:30" }, "end"],
      [{ date: "2026-11-02" }, "date"],
      [{ date: TODAY, start: "08:00", end: "08:30" }, "start"],
    ];
    for (const [over, field] of cases) {
      const result = await svc.createBooking(s.docA, book(s, over));
      expect(result).toMatchObject({ ok: false, kind: "validation", field });
    }
    // hoje, mais tarde, vale
    expect(
      (await svc.createBooking(s.docA, book(s, { date: TODAY, start: "14:00", end: "15:00" }))).ok,
    ).toBe(true);
  });

  test("espaço inexistente é 'not_found'", async () => {
    const { s, svc } = await setup();
    expect(await svc.createBooking(s.docA, book(s, { spaceId: "nada" }))).toMatchObject({
      ok: false,
      kind: "not_found",
    });
  });

  test("conflito com importada: recusa identificando título, espaço e horários (sem nomes)", async () => {
    const { db, s, svc } = await setup();
    insertImported(db, {
      id: "i1",
      spaceId: s.sala1.id,
      date: "2026-11-10",
      start: "10:10",
      end: "12:00",
      title: "MAT1",
      responsibleUserId: s.docB.id,
    });
    const result = await svc.createBooking(s.docA, book(s));
    expect(result).toMatchObject({
      ok: false,
      kind: "conflict",
      message: "Conflita com MAT1 — ADM 2, 10:10–12:00.",
      conflict: { title: "MAT1", date: "2026-11-10", start: "10:10", end: "12:00" },
    });
    expect(JSON.stringify(result)).not.toContain("Pessoa");
  });

  test("intervalos adjacentes (09:50-10:10) e o almoço podem ser reservados", async () => {
    const { db, s, svc } = await setup();
    const base = {
      spaceId: s.sala1.id,
      date: "2026-11-10",
      title: "AULA",
      responsibleUserId: null,
    };
    insertImported(db, { ...base, id: "a", start: "08:00", end: "09:50" });
    insertImported(db, { ...base, id: "b", start: "10:10", end: "12:00" });
    insertImported(db, { ...base, id: "c", start: "13:30", end: "15:00" });
    expect((await svc.createBooking(s.docA, book(s, { start: "09:50", end: "10:10" }))).ok).toBe(
      true,
    );
    expect((await svc.createBooking(s.docA, book(s, { start: "12:00", end: "13:30" }))).ok).toBe(
      true,
    );
    // sobrepor um minuto já conflita
    expect(
      await svc.createBooking(s.docA, book(s, { start: "09:49", end: "10:10" })),
    ).toMatchObject({ ok: false, kind: "conflict" });
  });

  test("conflito entre duas avulsas; cancelada libera o horário", async () => {
    const { s, svc } = await setup();
    const first = await svc.createBooking(s.docA, book(s));
    if (!first.ok) throw new Error("primeira reserva");
    expect(
      await svc.createBooking(s.docB, book(s, { start: "10:30", end: "11:30" })),
    ).toMatchObject({
      ok: false,
      kind: "conflict",
    });
    expect(
      (await svc.cancelOccupation(s.docA, { occupationId: first.value.id, scope: "data" })).ok,
    ).toBe(true);
    expect((await svc.createBooking(s.docB, book(s, { start: "10:30", end: "11:30" }))).ok).toBe(
      true,
    );
  });

  test("duas reservas concorrentes na mesma conexão: só uma é confirmada", async () => {
    const { s, svc } = await setup();
    const results = await Promise.all([
      svc.createBooking(s.docA, book(s, { start: "10:00", end: "11:00" })),
      svc.createBooking(s.docB, book(s, { start: "10:30", end: "11:30" })),
      svc.createBooking(s.horarios, book(s, { start: "09:30", end: "10:30" })),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok && result.kind === "conflict")).toHaveLength(2);
  });
});

describe("cancelOccupation", () => {
  async function withImported() {
    const ctx = await setup();
    const base = {
      spaceId: ctx.s.sala1.id,
      start: "10:10",
      end: "12:00",
      title: "MAT1",
      responsibleUserId: ctx.s.docA.id,
    };
    // terças futuras do mesmo lote e uma passada
    for (const [id, date] of [
      ["p", "2026-10-27"],
      ["t1", "2026-11-10"],
      ["t2", "2026-11-17"],
      ["t3", "2026-11-24"],
    ] as const) {
      insertImported(ctx.db, { ...base, id, date });
    }
    insertImported(ctx.db, { ...base, id: "outra", date: "2026-11-11" });
    insertImported(ctx.db, {
      ...base,
      id: "alheia",
      date: "2026-11-10",
      spaceId: ctx.s.sala2.id,
      title: "FIS",
      responsibleUserId: ctx.s.docB.id,
    });
    return ctx;
  }

  test("responsável cancela a data; só aquela é cancelada, com motivo 'usuario'", async () => {
    const { db, s, svc } = await withImported();
    const result = await svc.cancelOccupation(s.docA, { occupationId: "t1", scope: "data" });
    expect(result).toEqual({ ok: true, value: { cancelled: 1 } });
    const rows = rawAll(
      db,
      "select id, status, cancel_reason, cancelled_at from occupations where status = 'cancelada'",
    );
    expect(rows).toEqual([
      {
        id: "t1",
        status: "cancelada",
        cancel_reason: "usuario",
        cancelled_at: "2026-11-03T12:00:00.000Z",
      },
    ]);
  });

  test("docente não cancela ocupação de outra pessoa (403/forbidden) e nada muda", async () => {
    const { s, svc } = await withImported();
    expect(await svc.cancelOccupation(s.docB, { occupationId: "t1", scope: "data" })).toMatchObject(
      {
        ok: false,
        kind: "forbidden",
      },
    );
    expect(
      await svc.cancelOccupation(s.docB, { occupationId: "t1", scope: "serie" }),
    ).toMatchObject({
      ok: false,
      kind: "forbidden",
    });
    expect(
      await svc.cancelOccupation(s.horarios, { occupationId: "t1", scope: "data" }),
    ).toMatchObject({
      ok: false,
      kind: "forbidden",
    });
    const mine = await svc.myBookings(s.docA, {});
    expect(mine.ok && mine.value.items.length).toBe(4);
  });

  test("admin cancela qualquer uma; criador cancela a própria avulsa; outro docente não", async () => {
    const { s, svc } = await withImported();
    expect(await svc.cancelOccupation(s.admin, { occupationId: "t1", scope: "data" })).toEqual({
      ok: true,
      value: { cancelled: 1 },
    });
    const created = await svc.createBooking(s.docB, book(s));
    if (!created.ok) throw new Error("criação");
    expect(
      await svc.cancelOccupation(s.docA, { occupationId: created.value.id, scope: "data" }),
    ).toMatchObject({ ok: false, kind: "forbidden" });
    expect(
      await svc.cancelOccupation(s.docB, { occupationId: created.value.id, scope: "data" }),
    ).toEqual({ ok: true, value: { cancelled: 1 } });
  });

  test("importada sem responsável só o admin cancela", async () => {
    const { db, s, svc } = await setup();
    insertImported(db, {
      id: "sr",
      spaceId: s.sala1.id,
      date: "2026-11-10",
      start: "08:00",
      end: "09:00",
      title: "SR",
      responsibleUserId: null,
    });
    expect(await svc.cancelOccupation(s.docA, { occupationId: "sr", scope: "data" })).toMatchObject(
      { ok: false, kind: "forbidden" },
    );
    expect((await svc.cancelOccupation(s.admin, { occupationId: "sr", scope: "data" })).ok).toBe(
      true,
    );
  });

  test("inexistente é not_found; já cancelada é conflito; conta inativa é recusada", async () => {
    const { s, svc } = await withImported();
    expect(
      await svc.cancelOccupation(s.docA, { occupationId: "nada", scope: "data" }),
    ).toMatchObject({ ok: false, kind: "not_found" });
    await svc.cancelOccupation(s.docA, { occupationId: "t1", scope: "data" });
    expect(await svc.cancelOccupation(s.docA, { occupationId: "t1", scope: "data" })).toMatchObject(
      { ok: false, kind: "conflict" },
    );
    expect(
      await svc.cancelOccupation(
        { ...s.docA, active: false },
        { occupationId: "t2", scope: "data" },
      ),
    ).toMatchObject({ ok: false, kind: "forbidden" });
  });

  test("ocupação que já terminou não é cancelada", async () => {
    const { s, svc } = await withImported();
    expect(await svc.cancelOccupation(s.docA, { occupationId: "p", scope: "data" })).toMatchObject({
      ok: false,
      kind: "validation",
    });
  });

  test("série de importada: só mesmas aulas futuras; passada, outro dia e outro espaço intactos", async () => {
    const { s, svc } = await withImported();
    const preview = await svc.previewSeries(s.docA, "t1");
    expect(preview).toEqual({
      ok: true,
      value: { dates: ["2026-11-10", "2026-11-17", "2026-11-24"] },
    });
    const result = await svc.cancelOccupation(s.docA, { occupationId: "t1", scope: "serie" });
    expect(result).toEqual({ ok: true, value: { cancelled: 3 } });
    const remaining = await svc.myBookings(s.docA, {});
    expect(remaining.ok && remaining.value.items.map((item) => item.id)).toEqual(["outra"]);
    const other = await svc.dayAgenda(s.docB, { spaceId: s.sala2.id, date: "2026-11-10" });
    expect(other.ok && other.value.occupations.map((item) => item.id)).toEqual(["alheia"]);
    // a passada continua ativa (consulta a data passada)
    const past = await svc.dayAgenda(s.docA, { spaceId: s.sala1.id, date: "2026-10-27" });
    expect(past.ok && past.value.occupations.map((item) => item.id)).toEqual(["p"]);
  });

  test("série de avulsa é recusada com mensagem clara; prévia também", async () => {
    const { s, svc } = await setup();
    const created = await svc.createBooking(s.docA, book(s));
    if (!created.ok) throw new Error("criação");
    const message = "Reservas avulsas não têm série; cancele apenas esta data.";
    expect(
      await svc.cancelOccupation(s.docA, { occupationId: created.value.id, scope: "serie" }),
    ).toMatchObject({ ok: false, kind: "validation", message });
    expect(await svc.previewSeries(s.docA, created.value.id)).toMatchObject({
      ok: false,
      kind: "validation",
      message,
    });
  });

  test("prévia de série exige permissão e existência", async () => {
    const { s, svc } = await withImported();
    expect(await svc.previewSeries(s.docB, "t1")).toMatchObject({ ok: false, kind: "forbidden" });
    expect(await svc.previewSeries(s.docA, "nada")).toMatchObject({ ok: false, kind: "not_found" });
    await svc.cancelOccupation(s.docA, { occupationId: "t1", scope: "data" });
    expect(await svc.previewSeries(s.docA, "t1")).toMatchObject({ ok: false, kind: "conflict" });
  });
});

describe("agenda", () => {
  test("dia: ocupações ativas, livres do expediente e blocos do semestre; canceladas omitidas", async () => {
    const { db, s, svc } = await setup();
    const base = { spaceId: s.sala1.id, date: "2026-11-10", responsibleUserId: s.docA.id };
    insertImported(db, { ...base, id: "a", start: "08:00", end: "09:50", title: "A" });
    insertImported(db, { ...base, id: "b", start: "10:10", end: "12:00", title: "B" });
    insertImported(db, {
      ...base,
      id: "c",
      start: "13:00",
      end: "14:00",
      title: "C",
      status: "cancelada",
    });
    const result = await svc.dayAgenda(s.docA, { spaceId: s.sala1.id, date: "2026-11-10" });
    if (!result.ok) throw new Error(result.message);
    expect(result.value.occupations.map((item) => [item.id, item.start, item.end])).toEqual([
      ["a", "08:00", "09:50"],
      ["b", "10:10", "12:00"],
    ]);
    expect(result.value.free).toEqual([
      { start: "06:00", end: "08:00" },
      { start: "09:50", end: "10:10" },
      { start: "12:00", end: "23:00" },
    ]);
    expect(result.value.blocks).toEqual([
      { label: "Noite 1", short: "N1", start: "18:50", end: "19:35" },
      { label: "Noite 2", short: "N2", start: "19:35", end: "20:20" },
    ]);
    expect(result.value.hours).toEqual({ opens: "06:00", closes: "23:00" });
  });

  test("canCancel e mine por espectador; visitante nunca vê nomes nem ids de pessoas", async () => {
    const { db, s, svc } = await setup();
    const base = { spaceId: s.sala1.id, date: "2026-11-10" };
    insertImported(db, {
      ...base,
      id: "a",
      start: "08:00",
      end: "09:00",
      title: "A",
      responsibleUserId: s.docA.id,
    });
    insertImported(db, {
      ...base,
      id: "b",
      start: "09:00",
      end: "10:00",
      title: "B",
      responsibleUserId: s.docB.id,
    });
    await svc.createBooking(s.docA, book(s, { start: "11:00", end: "12:00", purpose: "Minha" }));
    const view = async (user: User | null) => {
      const result = await svc.dayAgenda(user, { spaceId: s.sala1.id, date: "2026-11-10" });
      if (!result.ok) throw new Error(result.message);
      return result.value.occupations.map((item) => `${item.title}:${item.mine}:${item.canCancel}`);
    };
    expect(await view(s.docA)).toEqual(["A:true:true", "B:false:false", "Minha:true:true"]);
    expect(await view(s.docB)).toEqual(["A:false:false", "B:true:true", "Minha:false:false"]);
    expect(await view(s.admin)).toEqual(["A:false:true", "B:false:true", "Minha:false:true"]);
    expect(await view(s.horarios)).toEqual(["A:false:false", "B:false:false", "Minha:false:false"]);
    expect(await view(null)).toEqual(["A:false:false", "B:false:false", "Minha:false:false"]);

    const visitor = await svc.dayAgenda(null, { spaceId: s.sala1.id, date: "2026-11-10" });
    const json = JSON.stringify(visitor);
    for (const needle of [
      s.docA.id,
      s.docB.id,
      s.admin.id,
      "Pessoa",
      "doca@",
      "responsible",
      "createdBy",
    ]) {
      expect(json).not.toContain(needle);
    }
  });

  test("passadas não podem ser canceladas (canCancel falso)", async () => {
    const { db, s, svc } = await setup();
    insertImported(db, {
      id: "old",
      spaceId: s.sala1.id,
      date: "2026-10-27",
      start: "08:00",
      end: "09:00",
      title: "Velha",
      responsibleUserId: s.docA.id,
    });
    const result = await svc.dayAgenda(s.docA, { spaceId: s.sala1.id, date: "2026-10-27" });
    expect(result.ok && result.value.occupations[0]?.canCancel).toBe(false);
  });

  test("semana: sete dias a partir da segunda, cada ocupação no seu dia", async () => {
    const { db, s, svc } = await setup();
    insertImported(db, {
      id: "seg",
      spaceId: s.sala1.id,
      date: "2026-11-09",
      start: "08:00",
      end: "09:00",
      title: "Seg",
      responsibleUserId: null,
    });
    insertImported(db, {
      id: "dom",
      spaceId: s.sala1.id,
      date: "2026-11-15",
      start: "08:00",
      end: "09:00",
      title: "Dom",
      responsibleUserId: null,
    });
    insertImported(db, {
      id: "fora",
      spaceId: s.sala1.id,
      date: "2026-11-16",
      start: "08:00",
      end: "09:00",
      title: "Fora",
      responsibleUserId: null,
    });
    const result = await svc.weekAgenda(null, { spaceId: s.sala1.id, weekStart: "2026-11-09" });
    if (!result.ok) throw new Error(result.message);
    expect(result.value.days.map((day) => day.date)).toEqual([
      "2026-11-09",
      "2026-11-10",
      "2026-11-11",
      "2026-11-12",
      "2026-11-13",
      "2026-11-14",
      "2026-11-15",
    ]);
    expect(result.value.days.map((day) => day.occupations.map((item) => item.id))).toEqual([
      ["seg"],
      [],
      [],
      [],
      [],
      [],
      ["dom"],
    ]);
    expect(result.value.days[1]?.free).toEqual([{ start: "06:00", end: "23:00" }]);
  });

  test("sem semestre cobrindo a data, usa os blocos do semestre mais recente; sem semestre, sem blocos", async () => {
    const { s, svc } = await setup();
    const far = await svc.dayAgenda(null, { spaceId: s.sala1.id, date: "2027-03-01" });
    expect(far.ok && far.value.blocks.map((block) => block.label)).toEqual(["Noite 1", "Noite 2"]);
    const { db } = openDb();
    const empty = await seed(db);
    rawAll(db, "DELETE FROM semesters");
    const none = await makeService(db).dayAgenda(null, {
      spaceId: empty.sala1.id,
      date: "2026-11-10",
    });
    expect(none.ok && none.value.blocks).toEqual([]);
  });

  test("validações: espaço inexistente, data inválida", async () => {
    const { s, svc } = await setup();
    expect(await svc.dayAgenda(null, { spaceId: "nada", date: "2026-11-10" })).toMatchObject({
      ok: false,
      kind: "not_found",
    });
    expect(await svc.dayAgenda(null, { spaceId: s.sala1.id, date: "10/11/2026" })).toMatchObject({
      ok: false,
      kind: "validation",
      field: "date",
    });
    expect(
      await svc.weekAgenda(null, { spaceId: s.sala1.id, weekStart: "2026-13-01" }),
    ).toMatchObject({ ok: false, kind: "validation", field: "weekStart" });
    expect(await svc.weekAgenda(null, { spaceId: "nada", weekStart: "2026-11-09" })).toMatchObject({
      ok: false,
      kind: "not_found",
    });
  });
});

describe("myBookings", () => {
  test("próximas do usuário (criador ou responsável), com espaço, paginadas", async () => {
    const { db, s, svc } = await setup();
    for (let index = 0; index < 5; index++) {
      insertImported(db, {
        id: `m${index}`,
        spaceId: s.sala2.id,
        date: `2026-11-1${index}`,
        start: "08:00",
        end: "09:00",
        title: `M${index}`,
        responsibleUserId: s.docA.id,
      });
    }
    await svc.createBooking(s.docA, book(s, { date: "2026-11-05", purpose: "Avulsa" }));
    await svc.createBooking(s.docB, book(s, { date: "2026-11-06", purpose: "De B" }));
    const first = await svc.myBookings(s.docA, { limit: 4 });
    if (!first.ok) throw new Error(first.message);
    expect(first.value.items.map((item) => item.title)).toEqual(["Avulsa", "M0", "M1", "M2"]);
    expect(first.value.hasMore).toBe(true);
    expect(first.value.items[0]).toMatchObject({
      date: "2026-11-05",
      start: "10:00",
      end: "11:00",
      spaceName: "ADM 2",
      source: "manual",
    });
    const second = await svc.myBookings(s.docA, { limit: 4, offset: 4 });
    expect(second.ok && second.value.items.map((item) => item.title)).toEqual(["M3", "M4"]);
    expect(second.ok && second.value.hasMore).toBe(false);
  });

  test("'from' filtra por data e é validado; limite fora da faixa é recusado", async () => {
    const { db, s, svc } = await setup();
    insertImported(db, {
      id: "e",
      spaceId: s.sala2.id,
      date: "2026-11-20",
      start: "08:00",
      end: "09:00",
      title: "E",
      responsibleUserId: s.docA.id,
    });
    insertImported(db, {
      id: "l",
      spaceId: s.sala2.id,
      date: "2026-12-05",
      start: "08:00",
      end: "09:00",
      title: "L",
      responsibleUserId: s.docA.id,
    });
    const later = await svc.myBookings(s.docA, { from: "2026-12-01" });
    expect(later.ok && later.value.items.map((item) => item.title)).toEqual(["L"]);
    expect(await svc.myBookings(s.docA, { from: "x" })).toMatchObject({
      ok: false,
      kind: "validation",
      field: "from",
    });
    expect(await svc.myBookings(s.docA, { limit: 0 })).toMatchObject({ ok: false, field: "limit" });
    expect(await svc.myBookings(s.docA, { limit: 101 })).toMatchObject({
      ok: false,
      field: "limit",
    });
    expect(await svc.myBookings(s.docA, { offset: -1 })).toMatchObject({
      ok: false,
      field: "offset",
    });
  });
});
