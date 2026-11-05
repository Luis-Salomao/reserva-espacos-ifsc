import { describe, expect, test } from "bun:test";
import { createBookingsService } from "#/application/bookings";
import type { Role, User } from "#/domain/user";
import { createSemesterRepository } from "#/infra/db/repos/semester-repository";
import { createUserRepository } from "#/infra/db/repos/user-repository";
import {
  bookingDeps,
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
  return { id: "u-x", email: "x@x.org", name: "X", code: null, roles, active, placeholder: false };
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
      lessonId: "L1",
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
      lessonId: "LF",
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

  test("série por posse: docente só alcança as próprias linhas; admin, a série toda; outra aula com o mesmo título fica fora", async () => {
    const { db, s, svc } = await setup();
    const base = {
      spaceId: s.sala1.id,
      start: "10:10",
      end: "12:00",
      title: "MAT1",
      lessonId: "L1",
    };
    insertImported(db, { ...base, id: "a1", date: "2026-11-10", responsibleUserId: s.docA.id });
    insertImported(db, { ...base, id: "a2", date: "2026-11-17", responsibleUserId: s.docB.id });
    insertImported(db, { ...base, id: "a3", date: "2026-11-24", responsibleUserId: null });
    insertImported(db, { ...base, id: "a4", date: "2026-12-01", responsibleUserId: s.docA.id });
    insertImported(db, {
      ...base,
      id: "x1",
      date: "2026-12-08",
      lessonId: "L9",
      responsibleUserId: s.docA.id,
    });
    expect(await svc.previewSeries(s.docA, "a1")).toEqual({
      ok: true,
      value: { dates: ["2026-11-10", "2026-12-01"] },
    });
    expect(await svc.previewSeries(s.admin, "a1")).toEqual({
      ok: true,
      value: { dates: ["2026-11-10", "2026-11-17", "2026-11-24", "2026-12-01"] },
    });
    expect(await svc.cancelOccupation(s.docA, { occupationId: "a1", scope: "serie" })).toEqual({
      ok: true,
      value: { cancelled: 2 },
    });
    const rest = await svc.dayAgenda(s.admin, { spaceId: s.sala1.id, date: "2026-11-17" });
    expect(rest.ok && rest.value.occupations.map((item) => item.id)).toEqual(["a2"]);
    const rest2 = await svc.dayAgenda(s.admin, { spaceId: s.sala1.id, date: "2026-11-24" });
    expect(rest2.ok && rest2.value.occupations.map((item) => item.id)).toEqual(["a3"]);
    expect(await svc.cancelOccupation(s.admin, { occupationId: "a2", scope: "serie" })).toEqual({
      ok: true,
      value: { cancelled: 2 },
    });
  });

  test("expectedCount: diferente da série recalculada é conflito e nada é cancelado", async () => {
    const { s, svc } = await withImported();
    const wrong = await svc.cancelOccupation(s.docA, {
      occupationId: "t1",
      scope: "serie",
      expectedCount: 2,
    });
    expect(wrong).toMatchObject({ ok: false, kind: "conflict" });
    const mine = await svc.myBookings(s.docA, {});
    expect(mine.ok && mine.value.items.length).toBe(4);
    expect(
      await svc.cancelOccupation(s.docA, { occupationId: "t1", scope: "serie", expectedCount: 3 }),
    ).toEqual({ ok: true, value: { cancelled: 3 } });
  });

  test("expectedCount em escopo 'data' é ignorado", async () => {
    const { s, svc } = await withImported();
    expect(
      await svc.cancelOccupation(s.docA, { occupationId: "t1", scope: "data", expectedCount: 9 }),
    ).toEqual({ ok: true, value: { cancelled: 1 } });
  });

  test("série de avulsa é recusada com mensagem clara; prévia também", async () => {
    const { s, svc } = await setup();
    const created = await svc.createBooking(s.docA, book(s));
    if (!created.ok) throw new Error("criação");
    const message = "Esta reserva não faz parte de uma série; cancele apenas esta data.";
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
    expect(result.value.now).toBe("2026-11-03T09:00");
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

  test("logado vê o responsável da aula e quem fez a reserva; sem responsável fica nulo", async () => {
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
      responsibleUserId: null,
    });
    await svc.createBooking(s.docB, book(s, { start: "11:00", end: "12:00", purpose: "Minha" }));

    const day = await svc.dayAgenda(s.horarios, base);
    if (!day.ok) throw new Error(day.message);
    expect(day.value.occupations.map((item) => [item.title, item.person])).toEqual([
      ["A", { name: "Pessoa doca", code: "DOCA", placeholder: false }],
      ["B", null],
      ["Minha", { name: "Pessoa docb", code: "DOCB", placeholder: false }],
    ]);

    const week = await svc.weekAgenda(s.docA, { spaceId: s.sala1.id, weekStart: "2026-11-09" });
    if (!week.ok) throw new Error(week.message);
    const persons = week.value.days.flatMap((d) => d.occupations.map((item) => item.person?.code));
    expect(persons).toEqual(["DOCA", undefined, "DOCB"]);

    const visitor = await svc.weekAgenda(null, { spaceId: s.sala1.id, weekStart: "2026-11-09" });
    if (!visitor.ok) throw new Error(visitor.message);
    expect(visitor.value.days.flatMap((d) => d.occupations.map((item) => item.person))).toEqual([
      null,
      null,
      null,
    ]);
  });

  test("responsável conta fantasma: logado recebe a marca; visitante recebe person nulo", async () => {
    const { db, s, svc } = await setup();
    const base = { spaceId: s.sala1.id, date: "2026-11-10" };
    insertImported(db, {
      ...base,
      id: "a",
      start: "08:00",
      end: "09:00",
      title: "A",
      responsibleUserId: s.docB.id,
    });
    rawAll(db, `UPDATE users SET placeholder = 1 WHERE id = '${s.docB.id}'`);

    const day = await svc.dayAgenda(s.docA, base);
    if (!day.ok) throw new Error(day.message);
    expect(day.value.occupations[0]?.person).toEqual({
      name: "Pessoa docb",
      code: "DOCB",
      placeholder: true,
    });

    const visitor = await svc.dayAgenda(null, base);
    if (!visitor.ok) throw new Error(visitor.message);
    expect(visitor.value.occupations[0]?.person).toBeNull();
    expect(JSON.stringify(visitor)).not.toContain("placeholder");
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

  test("semana exige segunda-feira e expõe 'now' local", async () => {
    const { s, svc } = await setup();
    expect(
      await svc.weekAgenda(null, { spaceId: s.sala1.id, weekStart: "2026-11-10" }),
    ).toMatchObject({
      ok: false,
      kind: "validation",
      field: "weekStart",
    });
    const week = await svc.weekAgenda(null, { spaceId: s.sala1.id, weekStart: "2026-11-09" });
    expect(week.ok && week.value.now).toBe("2026-11-03T09:00");
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

describe("roomsDay", () => {
  async function withRooms() {
    const ctx = await setup();
    const { spaces } = bookingDeps(ctx.db);
    const a1000 = await spaces.create({ name: "A-1000", capacity: null });
    const a202 = await spaces.create({ name: "A-202", capacity: 40 });
    const b104 = await spaces.create({ name: "B-104", capacity: 25 });
    return { ...ctx, a1000, a202, b104 };
  }

  test("um dia por sala, em ordem natural de nome, com nome e capacidade", async () => {
    const { s, svc } = await withRooms();
    const result = await svc.roomsDay(s.docA, { date: "2026-11-10" });
    if (!result.ok) throw new Error(result.message);
    expect(result.value.rooms.map((room) => room.space.name)).toEqual([
      "A-202",
      "A-1000",
      "ADM 2",
      "B-104",
      "LAB 1",
    ]);
    expect(result.value.rooms.find((room) => room.space.name === "A-202")?.space.capacity).toBe(40);
    expect(result.value.rooms.find((room) => room.space.name === "A-1000")?.space.capacity).toBe(
      null,
    );
    expect(result.value.date).toBe("2026-11-10");
    expect(result.value.now).toBe("2026-11-03T09:00");
    for (const room of result.value.rooms) {
      expect(room.spaceId).toBe(room.space.id);
      expect(room.date).toBe("2026-11-10");
    }
  });

  test("cada sala recebe só as próprias ocupações; sala sem ocupação vem com o dia todo livre", async () => {
    const { db, s, svc, b104 } = await withRooms();
    insertImported(db, {
      id: "b1",
      spaceId: b104.id,
      date: "2026-11-10",
      start: "08:00",
      end: "09:50",
      title: "MAT1",
      responsibleUserId: s.docA.id,
    });
    insertImported(db, {
      id: "s1",
      spaceId: s.sala1.id,
      date: "2026-11-10",
      start: "14:00",
      end: "15:00",
      title: "FIS1",
      responsibleUserId: null,
    });
    insertImported(db, {
      id: "outro-dia",
      spaceId: s.sala2.id,
      date: "2026-11-11",
      start: "08:00",
      end: "09:00",
      title: "QUI1",
      responsibleUserId: null,
    });
    const result = await svc.roomsDay(s.docA, { date: "2026-11-10" });
    if (!result.ok) throw new Error(result.message);
    const room = (name: string) => result.value.rooms.find((item) => item.space.name === name);
    expect(room("B-104")?.occupations.map((item) => [item.title, item.start, item.end])).toEqual([
      ["MAT1", "08:00", "09:50"],
    ]);
    expect(room("B-104")?.free).toEqual([
      { start: "06:00", end: "08:00" },
      { start: "09:50", end: "23:00" },
    ]);
    expect(room("ADM 2")?.occupations.map((item) => item.title)).toEqual(["FIS1"]);
    expect(room("LAB 1")?.occupations).toEqual([]);
    expect(room("LAB 1")?.free).toEqual([{ start: "06:00", end: "23:00" }]);
    expect(room("LAB 1")?.blocks.map((block) => block.short)).toEqual(["N1", "N2"]);
  });

  test("logado vê o responsável; visitante nunca recebe nomes nem ids de pessoas", async () => {
    const { db, s, svc, a202 } = await withRooms();
    insertImported(db, {
      id: "a",
      spaceId: a202.id,
      date: "2026-11-10",
      start: "08:00",
      end: "09:00",
      title: "MAT1",
      responsibleUserId: s.docA.id,
    });
    await svc.createBooking(s.docB, book(s, { purpose: "Minha" }));
    const logged = await svc.roomsDay(s.horarios, { date: "2026-11-10" });
    if (!logged.ok) throw new Error(logged.message);
    expect(
      logged.value.rooms.flatMap((room) => room.occupations.map((item) => item.person)),
    ).toEqual([
      { name: "Pessoa doca", code: "DOCA", placeholder: false },
      { name: "Pessoa docb", code: "DOCB", placeholder: false },
    ]);

    const visitor = await svc.roomsDay(null, { date: "2026-11-10" });
    if (!visitor.ok) throw new Error(visitor.message);
    expect(
      visitor.value.rooms.flatMap((room) => room.occupations.map((item) => item.person)),
    ).toEqual([null, null]);
    const json = JSON.stringify(visitor);
    for (const needle of [s.docA.id, s.docB.id, "Pessoa", "DOCA", "DOCB", "doca@"]) {
      expect(json).not.toContain(needle);
    }
  });

  test("traz os equipamentos; visitante não recebe as observações", async () => {
    const ctx = await setup();
    const { spaces } = bookingDeps(ctx.db);
    await spaces.create({
      name: "A-202",
      capacity: 40,
      equipment: { items: { projetor: 1, computadores: 12 }, notes: "Lousa digital" },
    });
    const logged = await ctx.svc.roomsDay(ctx.s.docA, { date: "2026-11-10" });
    const visitor = await ctx.svc.roomsDay(null, { date: "2026-11-10" });
    if (!logged.ok || !visitor.ok) throw new Error("consulta falhou");
    const of = (result: typeof logged) =>
      result.value.rooms.find((room) => room.space.name === "A-202")?.space.equipment;
    expect(of(logged)).toEqual({
      items: { projetor: 1, computadores: 12 },
      notes: "Lousa digital",
    });
    expect(of(visitor)?.items).toEqual({ projetor: 1, computadores: 12 });
    expect(JSON.stringify(visitor)).not.toContain("Lousa digital");
  });

  test("busca as ocupações de todas as salas numa única consulta", async () => {
    const { db, s } = await withRooms();
    const deps = bookingDeps(db);
    const repo = deps.occupations;
    const calls = { all: 0, one: 0 };
    const svc = createBookingsService({
      ...deps,
      occupations: {
        ...repo,
        listActiveInRangeAll: (from, to) => {
          calls.all++;
          return repo.listActiveInRangeAll(from, to);
        },
        listActiveInRange: (spaceId, from, to) => {
          calls.one++;
          return repo.listActiveInRange(spaceId, from, to);
        },
      },
    });
    const result = await svc.roomsDay(s.docA, { date: "2026-11-10" });
    expect(result.ok && result.value.rooms).toHaveLength(5);
    expect(calls).toEqual({ all: 1, one: 0 });
  });

  test("dia fora de qualquer semestre vem sem grade de blocos, com as reservas avulsas", async () => {
    const { s, svc } = await withRooms();
    const outside = "2027-01-11";
    const booked = await svc.createBooking(
      s.docA,
      book(s, { date: outside, start: "10:00", end: "11:00", purpose: "Recesso" }),
    );
    expect(booked.ok).toBe(true);
    const result = await svc.roomsDay(s.docA, { date: outside });
    if (!result.ok) throw new Error(result.message);
    for (const room of result.value.rooms) expect(room.blocks).toEqual([]);
    expect(
      result.value.rooms.flatMap((room) => room.occupations.map((item) => item.title)),
    ).toEqual(["Recesso"]);
  });

  test("data inválida falha com o campo; sem salas, lista vazia", async () => {
    const { s, svc } = await setup();
    expect(await svc.roomsDay(s.docA, { date: "2026-02-30" })).toMatchObject({
      ok: false,
      kind: "validation",
      field: "date",
    });
    expect(await svc.roomsDay(null, { date: "10/11/2026" })).toMatchObject({
      ok: false,
      kind: "validation",
      field: "date",
    });
    const empty = await makeService(openDb().db).roomsDay(null, { date: "2026-11-10" });
    expect(empty).toEqual({
      ok: true,
      value: { date: "2026-11-10", now: "2026-11-03T09:00", rooms: [] },
    });
  });
});

describe("roomsWeek", () => {
  /** Segunda-feira da semana usada nos testes. */
  const MONDAY = "2026-11-09";

  async function withRooms() {
    const ctx = await setup();
    const { spaces } = bookingDeps(ctx.db);
    const a1000 = await spaces.create({ name: "A-1000", capacity: null });
    const a202 = await spaces.create({ name: "A-202", capacity: 40 });
    return { ...ctx, a1000, a202 };
  }

  test("segunda a sexta de todas as salas, em ordem natural de nome, com nome e capacidade", async () => {
    const { s, svc } = await withRooms();
    const result = await svc.roomsWeek(s.docA, { weekStart: MONDAY });
    if (!result.ok) throw new Error(result.message);
    expect(result.value.weekStart).toBe(MONDAY);
    expect(result.value.now).toBe("2026-11-03T09:00");
    expect(result.value.days.map((day) => day.date)).toEqual([
      "2026-11-09",
      "2026-11-10",
      "2026-11-11",
      "2026-11-12",
      "2026-11-13",
    ]);
    expect(result.value.rooms.map((room) => room.space)).toEqual([
      { id: expect.any(String), name: "A-202", capacity: 40 },
      { id: expect.any(String), name: "A-1000", capacity: null },
      { id: s.sala1.id, name: "ADM 2", capacity: 30 },
      { id: s.sala2.id, name: "LAB 1", capacity: 20 },
    ]);
  });

  test("cada sala recebe as próprias ocupações da semana; sábado e domingo ficam de fora", async () => {
    const { db, s, svc, a202 } = await withRooms();
    const occupy = (id: string, spaceId: string, date: string, start: string, end: string) =>
      insertImported(db, { id, spaceId, date, start, end, title: id, responsibleUserId: null });
    occupy("dom-antes", a202.id, "2026-11-08", "08:00", "09:00");
    occupy("seg", a202.id, "2026-11-09", "07:30", "08:20");
    occupy("sex", a202.id, "2026-11-13", "19:35", "20:20");
    occupy("qua-adm", s.sala1.id, "2026-11-11", "18:50", "19:35");
    occupy("sab", a202.id, "2026-11-14", "08:00", "09:00");
    occupy("dom-depois", s.sala1.id, "2026-11-15", "08:00", "09:00");
    const result = await svc.roomsWeek(s.docA, { weekStart: MONDAY });
    if (!result.ok) throw new Error(result.message);
    const room = (name: string) => result.value.rooms.find((item) => item.space.name === name);
    expect(room("A-202")?.occupations.map((item) => [item.title, item.date, item.start])).toEqual([
      ["seg", "2026-11-09", "07:30"],
      ["sex", "2026-11-13", "19:35"],
    ]);
    expect(room("ADM 2")?.occupations.map((item) => [item.title, item.date])).toEqual([
      ["qua-adm", "2026-11-11"],
    ]);
    expect(room("LAB 1")?.occupations).toEqual([]);
  });

  test("cada dia traz os blocos só do semestre que o cobre; dia fora de semestre vem sem blocos", async () => {
    const { db, s, svc } = await setup();
    await bookingDeps(db).semesters.create({
      name: "2027/1",
      start: "2027-02-03",
      end: "2027-07-09",
      terms: [],
      blocks: [{ number: 1, name: "Manhã 1", short: "M1", start: "07:30", end: "08:20" }],
    });
    const result = await svc.roomsWeek(s.docA, { weekStart: "2027-02-01" });
    if (!result.ok) throw new Error(result.message);
    expect(result.value.days.map((day) => [day.date, day.blocks.map((b) => b.short)])).toEqual([
      ["2027-02-01", []],
      ["2027-02-02", []],
      ["2027-02-03", ["M1"]],
      ["2027-02-04", ["M1"]],
      ["2027-02-05", ["M1"]],
    ]);
    const inside = await svc.roomsWeek(s.docA, { weekStart: MONDAY });
    if (!inside.ok) throw new Error(inside.message);
    expect(inside.value.days[0]?.blocks).toEqual([
      { label: "Noite 1", short: "N1", start: "18:50", end: "19:35" },
      { label: "Noite 2", short: "N2", start: "19:35", end: "20:20" },
    ]);
  });

  test("logado vê o responsável; visitante nunca recebe nomes nem ids de pessoas", async () => {
    const { db, s, svc, a202 } = await withRooms();
    insertImported(db, {
      id: "a",
      spaceId: a202.id,
      date: "2026-11-11",
      start: "08:00",
      end: "09:00",
      title: "MAT1",
      responsibleUserId: s.docA.id,
    });
    await svc.createBooking(s.docB, book(s, { purpose: "Minha" }));
    const logged = await svc.roomsWeek(s.horarios, { weekStart: MONDAY });
    if (!logged.ok) throw new Error(logged.message);
    expect(
      logged.value.rooms.flatMap((room) => room.occupations.map((item) => item.person)),
    ).toEqual([
      { name: "Pessoa doca", code: "DOCA", placeholder: false },
      { name: "Pessoa docb", code: "DOCB", placeholder: false },
    ]);

    const visitor = await svc.roomsWeek(null, { weekStart: MONDAY });
    if (!visitor.ok) throw new Error(visitor.message);
    expect(
      visitor.value.rooms.flatMap((room) => room.occupations.map((item) => item.person)),
    ).toEqual([null, null]);
    const json = JSON.stringify(visitor);
    for (const needle of [s.docA.id, s.docB.id, "Pessoa", "DOCA", "DOCB", "doca@"]) {
      expect(json).not.toContain(needle);
    }
  });

  test("a semana traz os equipamentos e omite as observações do visitante", async () => {
    const ctx = await setup();
    const { spaces } = bookingDeps(ctx.db);
    await spaces.create({
      name: "B-104",
      capacity: 25,
      equipment: { items: { som: 1 }, notes: "Caixa no fundo" },
    });
    const logged = await ctx.svc.roomsWeek(ctx.s.horarios, { weekStart: MONDAY });
    const visitor = await ctx.svc.roomsWeek(null, { weekStart: MONDAY });
    if (!logged.ok || !visitor.ok) throw new Error("consulta falhou");
    const of = (result: typeof logged) =>
      result.value.rooms.find((room) => room.space.name === "B-104")?.space.equipment;
    expect(of(logged)).toEqual({ items: { som: 1 }, notes: "Caixa no fundo" });
    expect(of(visitor)).toEqual({ items: { som: 1 }, notes: null });
    expect(JSON.stringify(visitor)).not.toContain("Caixa no fundo");
  });

  test("busca as ocupações da semana inteira numa única consulta, de segunda a sábado 00:00", async () => {
    const { db, s } = await withRooms();
    const deps = bookingDeps(db);
    const repo = deps.occupations;
    const all: Array<[string, string]> = [];
    let one = 0;
    const svc = createBookingsService({
      ...deps,
      occupations: {
        ...repo,
        listActiveInRangeAll: (from, to) => {
          all.push([from, to]);
          return repo.listActiveInRangeAll(from, to);
        },
        listActiveInRange: (spaceId, from, to) => {
          one++;
          return repo.listActiveInRange(spaceId, from, to);
        },
      },
    });
    const result = await svc.roomsWeek(s.docA, { weekStart: MONDAY });
    expect(result.ok && result.value.rooms).toHaveLength(4);
    expect(all).toEqual([["2026-11-09T00:00", "2026-11-14T00:00"]]);
    expect(one).toBe(0);
  });

  test("semana que não começa numa segunda ou data inválida falha com o campo", async () => {
    const { s, svc } = await setup();
    expect(await svc.roomsWeek(s.docA, { weekStart: "2026-11-10" })).toMatchObject({
      ok: false,
      kind: "validation",
      field: "weekStart",
    });
    expect(await svc.roomsWeek(null, { weekStart: "2026-02-30" })).toMatchObject({
      ok: false,
      kind: "validation",
      field: "weekStart",
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

describe("subjects", () => {
  test("separa as do docente, sem repetir, em ordem pt-BR", async () => {
    const { db, s, svc } = await setup();
    const at = (id: string, title: string, responsibleUserId: string | null, start = "08:00") =>
      insertImported(db, {
        id,
        spaceId: s.sala1.id,
        date: "2026-11-10",
        start,
        end: "09:00",
        title,
        responsibleUserId,
      });
    at("z", "Zebra — 2B", s.docA.id, "08:00");
    at("a", "Álgebra — 1A", s.docA.id, "10:00");
    at("a-outro", "Álgebra — 1A", s.docB.id, "13:00");
    at("q", "Química — 3C", s.docB.id, "14:00");
    at("n10", "aula 10", null, "15:00");
    at("n2", "aula 2", null, "16:00");
    insertImported(db, {
      id: "velha-data",
      spaceId: s.sala1.id,
      date: "2025-09-01",
      start: "08:00",
      end: "09:00",
      title: "Fora do semestre",
      responsibleUserId: s.docA.id,
    });

    const mine = await svc.subjects(s.docA, { date: "2026-11-10" });
    expect(mine).toEqual({
      ok: true,
      value: {
        mine: ["Álgebra — 1A", "Zebra — 2B"],
        all: ["aula 10", "aula 2", "Química — 3C"],
      },
    });
    const other = await svc.subjects(s.docB, { date: "2026-11-10" });
    expect(other.ok && other.value.mine).toEqual(["Álgebra — 1A", "Química — 3C"]);
    expect(other.ok && other.value.all).toEqual(["aula 10", "aula 2", "Zebra — 2B"]);
    const none = await svc.subjects(s.horarios, { date: "2026-11-10" });
    expect(none.ok && none.value.mine).toEqual([]);
    expect(none.ok && none.value.all).toEqual([
      "Álgebra — 1A",
      "aula 10",
      "aula 2",
      "Química — 3C",
      "Zebra — 2B",
    ]);
  });

  test("fora de semestre usa o mais recente; dentro do antigo, só o antigo", async () => {
    const { db, s, svc } = await setup();
    await createSemesterRepository(db).create({
      name: "2025/2",
      start: "2025-08-01",
      end: "2025-12-15",
      terms: [],
      blocks: [],
    });
    insertImported(db, {
      id: "antiga",
      spaceId: s.sala1.id,
      date: "2025-09-01",
      start: "08:00",
      end: "09:00",
      title: "Antiga — 1A",
      responsibleUserId: s.docA.id,
    });
    insertImported(db, {
      id: "nova",
      spaceId: s.sala1.id,
      date: "2026-11-10",
      start: "08:00",
      end: "09:00",
      title: "Nova — 1A",
      responsibleUserId: s.docA.id,
    });
    const insideOld = await svc.subjects(s.docA, { date: "2025-09-10" });
    expect(insideOld).toEqual({ ok: true, value: { mine: ["Antiga — 1A"], all: [] } });
    const insideNew = await svc.subjects(s.docA, { date: "2026-11-10" });
    expect(insideNew).toEqual({ ok: true, value: { mine: ["Nova — 1A"], all: [] } });
    const outside = await svc.subjects(s.docA, { date: "2027-03-01" });
    expect(outside).toEqual({ ok: true, value: { mine: ["Nova — 1A"], all: [] } });
  });

  test("sem semestre e sem aulas, os dois grupos vêm vazios", async () => {
    const { db } = openDb();
    const doc = await createUserRepository(db).create({
      email: "so@x.org",
      name: "Pessoa so",
      code: "SO",
      roles: ["docente"],
      passwordHash: "x",
    });
    const empty = await makeService(db).subjects(doc, { date: "2026-11-10" });
    expect(empty).toEqual({ ok: true, value: { mine: [], all: [] } });

    const { s, svc } = await setup();
    expect(await svc.subjects(s.docA, { date: "2026-11-10" })).toEqual({
      ok: true,
      value: { mine: [], all: [] },
    });
  });

  test("quem não pode reservar é recusado; data inválida também, para quem pode", async () => {
    const { s, svc } = await setup();
    expect(await svc.subjects(guest([]), { date: "2026-11-10" })).toMatchObject({
      ok: false,
      kind: "forbidden",
      message: "Sem permissão para reservar.",
    });
    expect(await svc.subjects(guest(["docente"], false), { date: "2026-02-30" })).toMatchObject({
      ok: false,
      kind: "forbidden",
    });
    expect(await svc.subjects(s.docA, { date: "2026-02-30" })).toMatchObject({
      ok: false,
      kind: "validation",
      field: "date",
      message: "Informe uma data válida.",
    });
  });
});
