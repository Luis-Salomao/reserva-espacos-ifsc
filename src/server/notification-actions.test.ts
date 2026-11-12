import { expect, test } from "bun:test";
import { createNoticesService } from "#/application/notifications";
import { createRoomRequestsService } from "#/application/room-requests";
import type { User } from "#/domain/user";
import { createNotificationRepository } from "#/infra/db/repos/notification-repository";
import { createOccupationRepository } from "#/infra/db/repos/occupation-repository";
import { createRoomRequestRepository } from "#/infra/db/repos/room-request-repository";
import { createSpaceRepository } from "#/infra/db/repos/space-repository";
import { createUserRepository } from "#/infra/db/repos/user-repository";
import { insertBatch, makeService, NOW, openDb, seed } from "../../test/booking-env";
import {
  acceptRequestAction,
  declineRequestAction,
  markNoticesReadAction,
  myNoticesAction,
  type NoticeDeps,
  requestRoomAction,
  withdrawRequestAction,
} from "./notification-actions.ts";

async function setup() {
  const { db } = openDb();
  const s = await seed(db);
  insertBatch(db, s.semester.id, s.admin.id);
  const tokens = new Map<string, User>([
    ["adm", s.admin],
    ["doca", s.docA],
    ["docb", s.docB],
  ]);
  const requests = createRoomRequestRepository(db);
  const clock = { now: () => NOW };
  const timeZone = "America/Sao_Paulo";
  const deps: NoticeDeps = {
    auth: {
      login: async () => ({ ok: false, reason: "invalid" }),
      authenticate: async (token) => tokens.get(token) ?? null,
      logout: async () => {},
    },
    cookieSecure: "auto",
    notices: createNoticesService({
      notifications: createNotificationRepository(db),
      requests,
      clock,
      timeZone,
    }),
    requests: createRoomRequestsService({
      occupations: createOccupationRepository(db),
      users: createUserRepository(db),
      spaces: createSpaceRepository(db),
      requests,
      clock,
      timeZone,
    }),
  };
  const req = (token: string | null) => ({
    url: "https://reservas.ifsc.edu.br/_serverFn/x",
    headers: new Headers(token === null ? {} : { cookie: `sid=${token}` }),
  });
  return { db, s, deps, req, bookings: makeService(db) };
}

test("todas as ações exigem sessão (401)", async () => {
  const { deps, req } = await setup();
  const calls = [
    myNoticesAction(deps, req(null), {}),
    markNoticesReadAction(deps, req(null), {}),
    requestRoomAction(deps, req(null), {}),
    acceptRequestAction(deps, req(null), {}),
    declineRequestAction(deps, req(null), {}),
    withdrawRequestAction(deps, req(null), {}),
  ];
  for (const outcome of await Promise.all(calls)) {
    expect(outcome.response).toMatchObject({ ok: false, status: 401 });
  }
});

test("corpo inválido é 400", async () => {
  const { deps, req } = await setup();
  const bad: Array<Promise<{ response: unknown }>> = [
    requestRoomAction(deps, req("doca"), "x"),
    requestRoomAction(deps, req("doca"), { occupationId: "a" }),
    requestRoomAction(deps, req("doca"), { occupationId: "a", purpose: "p", message: 3 }),
    acceptRequestAction(deps, req("doca"), {}),
    declineRequestAction(deps, req("doca"), {}),
    declineRequestAction(deps, req("doca"), { requestId: "a", note: 3 }),
    withdrawRequestAction(deps, req("doca"), {}),
  ];
  for (const outcome of await Promise.all(bad)) {
    expect(outcome.response).toMatchObject({ ok: false, status: 400 });
  }
});

test("fluxo: pedir, ver, recusar com motivo, pedir de novo, aceitar, marcar lidos", async () => {
  const { deps, req, s, bookings } = await setup();
  const booked = await bookings.createBooking(s.docB, {
    spaceId: s.sala1.id,
    date: "2026-11-10",
    start: "10:00",
    end: "11:00",
    purpose: "Reunião de B",
  });
  if (!booked.ok) throw new Error(booked.message);
  const asked = await requestRoomAction(deps, req("doca"), {
    occupationId: booked.value.id,
    purpose: "Prova de A",
    message: "Por favor",
  });
  if (!asked.response.ok) throw new Error(asked.response.message);
  const mine = await myNoticesAction(deps, req("docb"), undefined);
  expect(mine.response).toMatchObject({
    ok: true,
    data: { incoming: [{ purpose: "Prova de A" }] },
  });

  expect(
    await declineRequestAction(deps, req("docb"), {
      requestId: asked.response.data.id,
      note: "Uso a sala",
    }),
  ).toMatchObject({ response: { ok: true } });
  const again = await requestRoomAction(deps, req("doca"), {
    occupationId: booked.value.id,
    purpose: "Prova de A",
  });
  if (!again.response.ok) throw new Error(again.response.message);
  expect(
    await withdrawRequestAction(deps, req("doca"), { requestId: again.response.data.id }),
  ).toMatchObject({ response: { ok: true } });
  const third = await requestRoomAction(deps, req("adm"), {
    occupationId: booked.value.id,
    purpose: "Reunião",
  });
  if (!third.response.ok) throw new Error(third.response.message);
  expect(
    await acceptRequestAction(deps, req("doca"), { requestId: third.response.data.id }),
  ).toMatchObject({ response: { ok: false, status: 403 } });
  expect(
    await acceptRequestAction(deps, req("docb"), { requestId: third.response.data.id }),
  ).toMatchObject({ response: { ok: true } });

  const forA = await myNoticesAction(deps, req("doca"), {});
  expect(forA.response).toMatchObject({ ok: true, data: { notices: [{ unread: true }] } });
  expect(await markNoticesReadAction(deps, req("doca"), {})).toMatchObject({
    response: { ok: true },
  });
  const read = await myNoticesAction(deps, req("doca"), {});
  expect(read.response).toMatchObject({ ok: true, data: { notices: [{ unread: false }] } });
});
