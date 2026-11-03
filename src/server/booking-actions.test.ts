import { describe, expect, test } from "bun:test";
import type { User } from "#/domain/user";
import { insertBatch, insertImported, makeService, openDb, seed } from "../../test/booking-env";
import {
  type BookingDeps,
  cancelOccupationAction,
  createBookingAction,
  getDayAgenda,
  getWeekAgenda,
  myBookingsAction,
  previewSeriesAction,
} from "./booking-actions.ts";

async function setup(publicRead = true) {
  const { db } = openDb();
  const s = await seed(db);
  insertBatch(db, s.semester.id, s.admin.id);
  const tokens = new Map<string, User>([
    ["adm", s.admin],
    ["hor", s.horarios],
    ["doca", s.docA],
    ["docb", s.docB],
    ["off", { ...s.docA, active: false }],
  ]);
  const deps: BookingDeps = {
    auth: {
      login: async () => ({ ok: false, reason: "invalid" }),
      authenticate: async (token) => {
        const found = tokens.get(token) ?? null;
        return found?.active ? found : null;
      },
      logout: async () => {},
    },
    bookings: makeService(db),
    cookieSecure: "auto",
    publicRead,
  };
  const req = (token: string | null) => ({
    url: "https://reservas.ifsc.edu.br/_serverFn/x",
    headers: new Headers(token === null ? {} : { cookie: `sid=${token}` }),
  });
  return { db, s, deps, req };
}

const body = (s: Awaited<ReturnType<typeof setup>>["s"], over: Record<string, unknown> = {}) => ({
  spaceId: s.sala1.id,
  date: "2026-11-10",
  start: "10:00",
  end: "11:00",
  purpose: "Reunião",
  ...over,
});

describe("agenda: leitura", () => {
  test("PUBLIC_READ=true: visitante lê e não vê pessoas nem ações", async () => {
    const { db, s, deps, req } = await setup(true);
    insertImported(db, {
      id: "a",
      spaceId: s.sala1.id,
      date: "2026-11-10",
      start: "08:00",
      end: "09:00",
      title: "MAT1",
      responsibleUserId: s.docA.id,
    });
    const day = await getDayAgenda(deps, req(null), { spaceId: s.sala1.id, date: "2026-11-10" });
    expect(day.response.ok).toBe(true);
    const json = JSON.stringify(day.response);
    expect(json).toContain("MAT1");
    expect(json).not.toContain(s.docA.id);
    expect(json).not.toContain("Pessoa");
    expect(day.setCookie).toBeNull();
    const week = await getWeekAgenda(deps, req(null), {
      spaceId: s.sala1.id,
      weekStart: "2026-11-09",
    });
    expect(week.response.ok).toBe(true);
  });

  test("PUBLIC_READ=false: visitante recebe 401, logado lê e o cookie é renovado", async () => {
    const { s, deps, req } = await setup(false);
    const input = { spaceId: s.sala1.id, date: "2026-11-10" };
    expect((await getDayAgenda(deps, req(null), input)).response).toMatchObject({
      ok: false,
      status: 401,
    });
    expect(
      (await getWeekAgenda(deps, req(null), { spaceId: s.sala1.id, weekStart: "2026-11-09" }))
        .response,
    ).toMatchObject({ ok: false, status: 401 });
    const logged = await getDayAgenda(deps, req("doca"), input);
    expect(logged.response.ok).toBe(true);
    expect(logged.setCookie).toContain("sid=doca");
  });

  test("entradas inválidas viram 400; espaço inexistente, 404", async () => {
    const { s, deps, req } = await setup();
    for (const data of [
      null,
      "x",
      {},
      { spaceId: 1, date: "2026-11-10" },
      { spaceId: s.sala1.id },
    ]) {
      expect((await getDayAgenda(deps, req(null), data)).response).toMatchObject({
        ok: false,
        status: 400,
      });
    }
    expect((await getWeekAgenda(deps, req(null), { spaceId: s.sala1.id })).response).toMatchObject({
      ok: false,
      status: 400,
    });
    expect(
      (await getDayAgenda(deps, req(null), { spaceId: s.sala1.id, date: "31/12/2026" })).response,
    ).toMatchObject({ ok: false, status: 400, field: "date" });
    expect(
      (await getDayAgenda(deps, req(null), { spaceId: "nada", date: "2026-11-10" })).response,
    ).toMatchObject({ ok: false, status: 404 });
  });
});

describe("reservar", () => {
  test("401 sem sessão, 401 com conta inativa; docente, horarios e admin criam", async () => {
    const { s, deps, req } = await setup();
    expect((await createBookingAction(deps, req(null), body(s))).response).toMatchObject({
      ok: false,
      status: 401,
    });
    expect((await createBookingAction(deps, req("off"), body(s))).response).toMatchObject({
      ok: false,
      status: 401,
    });
    for (const [index, token] of ["doca", "hor", "adm"].entries()) {
      const hour = String(8 + index).padStart(2, "0");
      const result = await createBookingAction(
        deps,
        req(token),
        body(s, { start: `${hour}:00`, end: `${hour}:30` }),
      );
      expect(result.response).toMatchObject({ ok: true, data: { title: "Reunião" } });
    }
  });

  test("usuário sem papel de reserva recebe 403", async () => {
    const { s, deps, req } = await setup();
    const roleless: User = { ...s.docA, id: "sem-papel", roles: [] };
    const custom: BookingDeps = {
      ...deps,
      auth: { ...deps.auth, authenticate: async () => roleless },
    };
    expect((await createBookingAction(custom, req("x"), body(s))).response).toMatchObject({
      ok: false,
      status: 403,
    });
  });

  test("corpo inválido é 400 tipado; validação do domínio também; conflito é 409 com a ocupação", async () => {
    const { db, s, deps, req } = await setup();
    for (const data of [null, [], {}, body(s, { purpose: 5 }), body(s, { start: undefined })]) {
      expect((await createBookingAction(deps, req("doca"), data)).response).toMatchObject({
        ok: false,
        status: 400,
      });
    }
    expect(
      (await createBookingAction(deps, req("doca"), body(s, { end: "09:00" }))).response,
    ).toMatchObject({ ok: false, status: 400, field: "end" });
    insertImported(db, {
      id: "i",
      spaceId: s.sala1.id,
      date: "2026-11-10",
      start: "10:10",
      end: "12:00",
      title: "MAT1",
      responsibleUserId: s.docB.id,
    });
    const conflict = await createBookingAction(deps, req("doca"), body(s));
    expect(conflict.response).toMatchObject({
      ok: false,
      status: 409,
      message: "Conflita com MAT1 — ADM 2, 10:10–12:00.",
    });
  });
});

describe("cancelar", () => {
  async function withLesson() {
    const ctx = await setup();
    const base = {
      spaceId: ctx.s.sala1.id,
      start: "10:10",
      end: "12:00",
      title: "MAT1",
      responsibleUserId: ctx.s.docA.id,
    };
    insertImported(ctx.db, { ...base, id: "t1", date: "2026-11-10" });
    insertImported(ctx.db, { ...base, id: "t2", date: "2026-11-17" });
    return ctx;
  }

  test("endpoint direto: docente tenta cancelar ocupação de outra pessoa -> 403 e nada muda", async () => {
    const { deps, req } = await withLesson();
    const data = { occupationId: "t1", scope: "data" };
    expect((await cancelOccupationAction(deps, req("docb"), data)).response).toMatchObject({
      ok: false,
      status: 403,
    });
    expect(
      (await cancelOccupationAction(deps, req("docb"), { ...data, scope: "serie" })).response,
    ).toMatchObject({ ok: false, status: 403 });
    expect(
      (await previewSeriesAction(deps, req("docb"), { occupationId: "t1" })).response,
    ).toMatchObject({ ok: false, status: 403 });
    const mine = await myBookingsAction(deps, req("doca"), {});
    expect(mine.response).toMatchObject({ ok: true });
    expect(mine.response.ok && mine.response.data.items).toHaveLength(2);
  });

  test("401 sem sessão em cancelar, prévia e minhas reservas", async () => {
    const { deps, req } = await withLesson();
    expect(
      (await cancelOccupationAction(deps, req(null), { occupationId: "t1", scope: "data" }))
        .response,
    ).toMatchObject({ ok: false, status: 401 });
    expect(
      (await previewSeriesAction(deps, req(null), { occupationId: "t1" })).response,
    ).toMatchObject({ ok: false, status: 401 });
    expect((await myBookingsAction(deps, req(null), {})).response).toMatchObject({
      ok: false,
      status: 401,
    });
  });

  test("responsável vê a prévia e cancela a série; admin cancela qualquer uma", async () => {
    const { deps, req } = await withLesson();
    const preview = await previewSeriesAction(deps, req("doca"), { occupationId: "t1" });
    expect(preview.response).toEqual({ ok: true, data: { dates: ["2026-11-10", "2026-11-17"] } });
    const done = await cancelOccupationAction(deps, req("doca"), {
      occupationId: "t1",
      scope: "serie",
    });
    expect(done.response).toEqual({ ok: true, data: { cancelled: 2 } });
    expect(
      (await cancelOccupationAction(deps, req("adm"), { occupationId: "t1", scope: "data" }))
        .response,
    ).toMatchObject({ ok: false, status: 409 });
  });

  test("entradas inválidas: 400; inexistente: 404", async () => {
    const { deps, req } = await withLesson();
    for (const data of [
      null,
      {},
      { occupationId: "t1" },
      { occupationId: "t1", scope: "tudo" },
      { occupationId: 3, scope: "data" },
    ]) {
      expect((await cancelOccupationAction(deps, req("doca"), data)).response).toMatchObject({
        ok: false,
        status: 400,
      });
    }
    expect((await previewSeriesAction(deps, req("doca"), {})).response).toMatchObject({
      ok: false,
      status: 400,
    });
    expect(
      (await cancelOccupationAction(deps, req("doca"), { occupationId: "nada", scope: "data" }))
        .response,
    ).toMatchObject({ ok: false, status: 404 });
  });
});

describe("minhas reservas", () => {
  test("lista as do usuário e valida paginação", async () => {
    const { s, deps, req } = await setup();
    await createBookingAction(deps, req("doca"), body(s));
    const mine = await myBookingsAction(deps, req("doca"), {
      limit: 10,
      offset: 0,
      from: "2026-11-01",
    });
    expect(mine.response.ok && mine.response.data.items.map((item) => item.title)).toEqual([
      "Reunião",
    ]);
    const other = await myBookingsAction(deps, req("docb"), undefined);
    expect(other.response.ok && other.response.data.items).toEqual([]);
    for (const data of [
      { limit: "5" },
      { limit: 0 },
      { offset: -1 },
      { from: 5 },
      { from: "x" },
      [],
    ]) {
      expect((await myBookingsAction(deps, req("doca"), data)).response).toMatchObject({
        ok: false,
        status: 400,
      });
    }
  });
});
