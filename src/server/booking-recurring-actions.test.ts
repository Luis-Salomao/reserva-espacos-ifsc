import { describe, expect, test } from "bun:test";
import type { User } from "#/domain/user";
import { insertBatch, makeService, openDb, rawAll, seed } from "../../test/booking-env";
import {
  type BookingDeps,
  createRecurringAction,
  previewRecurringAction,
} from "./booking-actions.ts";

async function setup() {
  const { db } = openDb();
  const s = await seed(db);
  insertBatch(db, s.semester.id, s.admin.id);
  const tokens = new Map<string, User>([
    ["doca", s.docA],
    ["leitor", { ...s.docA, id: "leitor", roles: [] }],
  ]);
  const deps: BookingDeps = {
    auth: {
      login: async () => ({ ok: false, reason: "invalid" }),
      authenticate: async (token) => tokens.get(token) ?? null,
      logout: async () => {},
    },
    bookings: makeService(db),
    cookieSecure: "auto",
    publicRead: true,
  };
  const req = (token: string | null) => ({
    url: "https://reservas.ifsc.edu.br/_serverFn/x",
    headers: new Headers(token === null ? {} : { cookie: `sid=${token}` }),
  });
  const body = (over: Record<string, unknown> = {}) => ({
    spaceId: s.sala1.id,
    date: "2026-11-10",
    start: "10:00",
    end: "11:00",
    purpose: "Monitoria",
    rule: { freq: "weekly", interval: 1, weekdays: [1], end: { kind: "count", count: 2 } },
    ...over,
  });
  return { db, deps, req, body };
}

describe("ações da reserva recorrente", () => {
  test("visitante recebe 401 e conta sem papel de reserva, 403, nas duas ações", async () => {
    const { deps, req, body } = await setup();
    for (const action of [previewRecurringAction, createRecurringAction]) {
      expect((await action(deps, req(null), { ...body(), confirmed: [] })).response).toMatchObject({
        ok: false,
        status: 401,
      });
      expect(
        (await action(deps, req("leitor"), { ...body(), confirmed: [] })).response,
      ).toMatchObject({ ok: false, status: 403 });
    }
  });

  test("prévia e confirmação pelo servidor", async () => {
    const { db, deps, req, body } = await setup();
    const preview = await previewRecurringAction(deps, req("doca"), body());
    expect(preview.response).toEqual({
      ok: true,
      data: {
        summary: "Toda terça, até 17/11, 2 datas",
        dates: [
          { date: "2026-11-10", free: true },
          { date: "2026-11-17", free: true },
        ],
      },
    });
    const created = await createRecurringAction(deps, req("doca"), {
      ...body(),
      confirmed: ["2026-11-10", "2026-11-17"],
    });
    expect(created.response).toMatchObject({
      ok: true,
      data: { created: true, dates: ["2026-11-10", "2026-11-17"] },
    });
    expect(rawAll(db, "SELECT id FROM occupations WHERE series_id IS NOT NULL")).toHaveLength(2);
  });

  test("regra com término por data e intervalo ausente (vale 1)", async () => {
    const { deps, req, body } = await setup();
    const result = await previewRecurringAction(
      deps,
      req("doca"),
      body({ rule: { freq: "monthly-day", end: { kind: "until", date: "2026-12-10" } } }),
    );
    expect(result.response).toMatchObject({
      ok: true,
      data: { summary: "Todo mês no dia 10, até 10/12, 2 datas" },
    });
  });

  test("limites da regra voltam como erro de validação no campo 'repeat'", async () => {
    const { deps, req, body } = await setup();
    const result = await previewRecurringAction(
      deps,
      req("doca"),
      body({
        rule: { freq: "weekly", interval: 13, weekdays: [1], end: { kind: "count", count: 2 } },
      }),
    );
    expect(result.response).toMatchObject({ ok: false, status: 400, field: "repeat" });
  });

  test("formato inválido vira 400 sem tocar no banco", async () => {
    const { db, deps, req, body } = await setup();
    const badRules = [
      null,
      "x",
      { freq: "diario", end: { kind: "count", count: 2 } },
      { freq: "weekly", weekdays: "seg", end: { kind: "count", count: 2 } },
      { freq: "weekly", weekdays: [1.5], end: { kind: "count", count: 2 } },
      { freq: "weekly", interval: "2", weekdays: [1], end: { kind: "count", count: 2 } },
      { freq: "weekly", weekdays: [1] },
      { freq: "weekly", weekdays: [1], end: { kind: "count", count: "2" } },
      { freq: "weekly", weekdays: [1], end: { kind: "until", date: 20261210 } },
    ];
    for (const rule of badRules) {
      expect(
        (await previewRecurringAction(deps, req("doca"), body({ rule }))).response,
      ).toMatchObject({ ok: false, status: 400, message: "Requisição inválida." });
    }
    for (const data of [null, "x", body({ spaceId: 1 }), body({ purpose: undefined })]) {
      expect((await previewRecurringAction(deps, req("doca"), data)).response).toMatchObject({
        ok: false,
        status: 400,
      });
    }
    const tooMany = Array.from({ length: 121 }, (_, i) => `d${i}`);
    for (const confirmed of [undefined, "2026-11-10", [1], tooMany]) {
      expect(
        (await createRecurringAction(deps, req("doca"), { ...body(), confirmed })).response,
      ).toMatchObject({ ok: false, status: 400 });
    }
    expect(rawAll(db, "SELECT id FROM occupations WHERE source = 'manual'")).toEqual([]);
  });
});
